import { promises } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const { rm } = promises;

const __dirname = dirname(fileURLToPath(import.meta.url));

const nuke = async () => {
  await rm(`${__dirname}/dist`, { recursive: true });
};

const noOp = () => {};

void nuke().catch(noOp);
