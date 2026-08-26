import readline from 'node:readline';
import process from 'node:process';

const input = readline.createInterface({ input: process.stdin });

input.on('line', (line) => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
    process.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2025-11-25',
        capabilities: { tools: {} },
        serverInfo: { name: 'legacy-fixture', version: '1.0.0' },
      },
    })}\n`);
  } else if (message.method === 'tools/list') {
    process.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        tools: [{ name: 'ping', description: 'Legacy ping', inputSchema: { type: 'object' } }],
      },
    })}\n`);
  }
});
