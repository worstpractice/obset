import { promises } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const getProjectRoot = () => {
  // @ts-ignore `import.meta` complaints, not a real concern
  return globalThis.__dirname || dirname(fileURLToPath(import.meta.url));
};

const nuke = async () => {
  // @ts-ignore we know, node 12. we know.
  const rm = promises.rm || promises.rmdir;

  await rm(`${getProjectRoot()}/dist`, { recursive: true });
};

const noOp = () => {};

void nuke().catch(noOp);
