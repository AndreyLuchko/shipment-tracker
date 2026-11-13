import 'dotenv/config';
import { runCli } from './simulator-cli.js';

process.exitCode = await runCli(process.argv.slice(2), process.env, {
  fetch,
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
});
