import { describe, it, expect } from 'vitest';
import { wordsChanged, privateText } from './saving-rules';
describe('saving rules', () => {
  it('counts inserted words', () => expect(wordsChanged('Please reverse charges', 'Please reverse these incorrect charges')).toBe(2));
  it('counts a replaced word once', () => expect(wordsChanged('Dear company', 'Dear support')).toBe(1));
  it('counts deleted words', () => expect(wordsChanged('Please reverse these charges', 'Please reverse charges')).toBe(1));
  it('does not count whitespace changes', () => expect(wordsChanged('Dear company', ' Dear  company\n')).toBe(0));
  it('removes phone numbers', () => expect(privateText('Call +91 98765 43210')).not.toContain('98765'));
  it('removes labelled account numbers', () => expect(privateText('Account number: ABC123')).not.toContain('ABC123'));
  it('removes labelled addresses', () => expect(privateText('Address: 12 Main Street')).not.toContain('Main Street'));
  it('keeps plan amounts', () => expect(privateText('₹749 plan, roaming off')).toBe('₹749 plan, roaming off'));
});
