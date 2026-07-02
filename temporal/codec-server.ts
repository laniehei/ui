import type { Server } from 'http';

import cors from 'cors';
import type { Application } from 'express';
import express from 'express';

export type CodecServer = {
  start: () => Promise<Server>;
  stop: () => Promise<void>;
};

export type CodecServerOptions = {
  port?: number;
};

interface Body {
  payloads: unknown[];
}

const PORT = 8888;

let codecServer: CodecServer;
export const getCodecServer = (): CodecServer => codecServer;

export async function createCodecServer(
  { port }: CodecServerOptions = { port: PORT },
): Promise<CodecServer> {
  let server: Server;
  const app: Application = express();

  app.use(cors({ allowedHeaders: ['x-namespace', 'content-type'] }));
  app.use(express.json());

  app.post('/encode', (req, res) => {
    const { payloads } = req.body as Body;
    res.json({ payloads }).end();
  });

  app.post('/decode', (req, res) => {
    const { payloads } = req.body as Body;
    res.json({ payloads }).end();
  });

  app.post('/download', (_req, res) => {
    res.status(404).end('Not found');
  });

  const start = () =>
    new Promise<Server>((resolve, reject) => {
      server = app.listen(port, () => {
        console.log(`✨ codec server listening on http://127.0.0.1:${port}`);
        server.on('error', (error) => {
          reject(error);
        });
        resolve(server);
      });
    });

  const stop = () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        console.log('🔪 killed codec server');
        resolve();
      });
    });

  codecServer = {
    start,
    stop,
  };

  return codecServer;
}
