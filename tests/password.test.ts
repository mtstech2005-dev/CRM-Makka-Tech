import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passwordSchema} from '../server/password.js';
test('bcrypt byte limit rejects truncation, including multibyte passwords',()=>{
 assert.equal(passwordSchema.safeParse('x'.repeat(72)).success,true);
 assert.equal(passwordSchema.safeParse('x'.repeat(73)).success,false);
 assert.equal(passwordSchema.safeParse('م'.repeat(37)).success,false);
 assert.equal(passwordSchema.safeParse('short').success,false);
});
