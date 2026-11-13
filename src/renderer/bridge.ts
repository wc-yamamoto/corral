import type { CorralApi } from "../preload/index";
import type { ClientMessage } from "../shared/model";

declare global {
  interface Window {
    corral: CorralApi;
  }
}

export const corral = {
  ...window.corral,
  send: (msg: ClientMessage) => window.corral.send(msg),
};
