import {z} from 'zod';
// bcrypt only considers the first 72 UTF-8 bytes. Reject longer passwords rather
// than silently allowing different passwords to authenticate as the same value.
export const passwordSchema=z.string().min(12).max(72).refine(value=>Buffer.byteLength(value,'utf8')<=72,{message:'كلمة المرور تتجاوز الحد المسموح (72 بايت)'});
