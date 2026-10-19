import { createFileRoute } from '@tanstack/react-router';
import { AuthForm } from '@/components/auth-form';
export const Route = createFileRoute('/auth')({ head: () => ({ meta: [{ title: 'Sign in — BillShield' }, { name: 'description', content: 'Sign in to privately check and save your bills.' }, { property: 'og:title', content: 'Sign in — BillShield' }, { property: 'og:description', content: 'Your private BillShield account.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }), component: AuthForm });
