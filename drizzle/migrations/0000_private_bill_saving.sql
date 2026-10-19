CREATE TABLE public.bills (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, provider text NOT NULL, bill_period text, total_on_bill numeric, calculated_total numeric NOT NULL, file_path text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills TO authenticated; GRANT ALL ON public.bills TO service_role;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_bills ON public.bills FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid() AND split_part(file_path,'/',1)=auth.uid()::text);
CREATE TABLE public.line_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bill_id uuid NOT NULL, user_id uuid NOT NULL, label text NOT NULL, amount numeric NOT NULL, flag text NOT NULL CHECK(flag IN ('OK','Unexplained','Wrong')), note text, UNIQUE(id,user_id), FOREIGN KEY(bill_id,user_id) REFERENCES public.bills(id,user_id) ON DELETE CASCADE);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.line_items TO authenticated; GRANT ALL ON public.line_items TO service_role;
ALTER TABLE public.line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_lines ON public.line_items FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE TABLE public.promises (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, provider text NOT NULL, promise_text text NOT NULL, promised_price numeric, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promises TO authenticated; GRANT ALL ON public.promises TO service_role;
ALTER TABLE public.promises ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_promises ON public.promises FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE TABLE public.messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), line_item_id uuid, user_id uuid NOT NULL, message_text text NOT NULL, edited_text text, words_changed integer NOT NULL DEFAULT 0 CHECK(words_changed>=0), sent boolean NOT NULL DEFAULT false, sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(line_item_id,user_id) REFERENCES public.line_items(id,user_id) ON DELETE CASCADE);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated; GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_messages ON public.messages FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE INDEX bills_owner_date ON public.bills(user_id,created_at DESC);
CREATE INDEX lines_bill ON public.line_items(bill_id);
CREATE INDEX messages_line ON public.messages(line_item_id);
CREATE POLICY own_bill_files ON storage.objects FOR ALL TO authenticated USING(bucket_id='bills-private' AND (storage.foldername(name))[1]=auth.uid()::text) WITH CHECK(bucket_id='bills-private' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE FUNCTION public.save_bill_check(payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b uuid; l uuid; main_line uuid; item jsonb; m uuid; saved_at timestamptz := now();
BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
INSERT INTO public.bills(user_id,provider,bill_period,total_on_bill,calculated_total,file_path,created_at) VALUES(auth.uid(),payload->>'provider',payload->>'bill_period',(payload->>'total_on_bill')::numeric,(payload->>'calculated_total')::numeric,payload->>'file_path',saved_at) RETURNING id INTO b;
FOR item IN SELECT * FROM jsonb_array_elements(payload->'lines') LOOP
INSERT INTO public.line_items(bill_id,user_id,label,amount,flag,note) VALUES(b,auth.uid(),item->>'label',(item->>'amount')::numeric,item->>'flag',item->>'reason') RETURNING id INTO l;
IF main_line IS NULL AND item->>'flag' <> 'OK' THEN main_line := l; END IF;
END LOOP;
IF main_line IS NULL THEN SELECT id INTO main_line FROM public.line_items WHERE bill_id=b LIMIT 1; END IF;
INSERT INTO public.promises(user_id,provider,promise_text,promised_price,created_at) VALUES(auth.uid(),payload->>'provider',payload->>'promise',(payload->>'promised_price')::numeric,saved_at);
INSERT INTO public.messages(line_item_id,user_id,message_text,created_at) VALUES(main_line,auth.uid(),payload->>'message',saved_at) RETURNING id INTO m;
RETURN jsonb_build_object('billId',b,'messageId',m);
END; $$;
REVOKE ALL ON FUNCTION public.save_bill_check(jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.save_bill_check(jsonb) TO authenticated;