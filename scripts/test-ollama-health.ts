/** Model-availability matching. Guards a bug that produced a false "Connected". */
import { hasModel } from '../src/llm/ollama';

const installed = ['qwen3:4b', 'nomic-embed-text:latest', 'gemma3:12b-it-qat'];
let pass = 0, fail = 0;
const check = (l: string, ok: boolean) => { console.log(`${ok?'PASS':'FAIL'}  ${l}`); ok?pass++:fail++; };

check('exact name+tag matches', hasModel(installed, 'qwen3:4b'));
check('tag-less request matches any tag', hasModel(installed, 'qwen3'));
check('nomic-embed-text (latest tag) matches', hasModel(installed, 'nomic-embed-text'));
check('hyphenated tag matches', hasModel(installed, 'gemma3:12b-it-qat'));
// The regression: dot-versioned successor must NOT match its predecessor.
check('qwen3.5:9b NOT satisfied by qwen3:4b', !hasModel(installed, 'qwen3.5:9b'));
check('qwen3.5:4b NOT satisfied by qwen3:4b', !hasModel(installed, 'qwen3.5:4b'));
check('qwen3.5 NOT satisfied by qwen3', !hasModel(installed, 'qwen3.5'));
check('gemma4:12b NOT satisfied by gemma3', !hasModel(installed, 'gemma4:12b'));
check('wrong tag of a present model is missing', !hasModel(installed, 'qwen3:14b'));
check('absent model is missing', !hasModel(installed, 'llama3:8b'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
