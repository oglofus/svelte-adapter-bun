import type { Server } from 'bun';

declare global {
  var fixtureStartup: string | undefined;
  namespace App {
    interface Platform {
      server: Server<unknown>;
      request: Request;
    }
  }
}

export {};
