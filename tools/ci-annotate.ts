// Runs one CI step and, when it fails, publishes the tail of its output as a GitHub annotation
// (shown on the run and the pull request, and readable through the API without admin rights).
import { spawn } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

const command = process.argv.slice(2).join(' ');
if (!command) {
  console.error('usage: ci-annotate <command...>');
  process.exit(2);
}
const TAIL_LINES = 40;
const MAX_MESSAGE = 3500;
const tail: string[] = [];
const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
const forward = (stream: NodeJS.ReadableStream, sink: NodeJS.WriteStream) => {
  stream.on('data', (chunk: Buffer) => {
    sink.write(chunk);
    tail.push(...chunk.toString('utf8').split(/\r?\n/).filter(Boolean));
    if (tail.length > TAIL_LINES) tail.splice(0, tail.length - TAIL_LINES);
  });
};
forward(child.stdout, process.stdout);
forward(child.stderr, process.stderr);
child.on('error', (error) => {
  console.error(`ci-annotate: unable to start command: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  if (code && process.env.GITHUB_ACTIONS) {
    const clean = stripVTControlCharacters(tail.join('\n')).slice(-MAX_MESSAGE);
    const escaped = clean.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::error title=${command.replace(/[,:]/g, ' ')}::${escaped}`);
  }
  process.exit(code ?? 1);
});
