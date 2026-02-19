import assert from "node:assert/strict";
import { debounce } from "../../lib/utils/debounce.ts";
import { runSuite } from "./test-utils.ts";

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function runDebounceTests() {
  await runSuite("debounce utility", [
    {
      name: "calls function once after debounce delay",
      fn: async () => {
        let count = 0;
        const debounced = debounce(() => {
          count += 1;
        }, 20);

        debounced();
        debounced();
        debounced();
        await wait(35);

        assert.equal(count, 1);
      },
    },
    {
      name: "uses latest arguments for final invocation",
      fn: async () => {
        let captured = "";
        const debounced = debounce((value: string) => {
          captured = value;
        }, 20);

        debounced("first");
        debounced("latest");
        await wait(35);

        assert.equal(captured, "latest");
      },
    },
  ]);
}
