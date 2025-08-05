import { TOKNE_INFO } from "./module";
import { pumpProcess } from "./processes";

(async () => {
  const resp = await pumpProcess(TOKNE_INFO);
})();
