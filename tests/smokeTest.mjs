//@ts-check
import { ObSet } from '../dist/ObSet.js';

const log = (o) => console.dir(o, { compact: false, depth: null, getters: true, showHidden: true, showProxy: true, sorted: true });

/** @type {ObSet<'a' | 'b' | 'c'>} */
const o = new ObSet() //
  .once('add', () => console.count('add once'))
  .once('empty', () => console.count('empty once'))
  .once('remove', () => console.count('remove once'));

o.add('a');
// log(o);
o.add('a');
// log(o);
o.remove('a');
// log(o);
o.remove('a');

log(o);
