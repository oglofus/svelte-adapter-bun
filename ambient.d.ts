import type { Server } from 'bun';

declare global {
  namespace App {
    export interface Platform {
      server: Server;
      request: Request;
      /** Upgrade the original Bun request. Return a placeholder Response from the hook on success. */
      upgrade(options?: Parameters<Server<unknown>['upgrade']>[1]): boolean;
    }
  }
}
