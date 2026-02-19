export type TestCase = {
  name: string;
  fn: () => void | Promise<void>;
};

export async function runSuite(name: string, cases: TestCase[]) {
  let failed = 0;
  console.log(`\n[Suite] ${name}`);

  for (const testCase of cases) {
    try {
      await testCase.fn();
      console.log(`  PASS ${testCase.name}`);
    } catch (error) {
      failed += 1;
      console.error(`  FAIL ${testCase.name}`);
      console.error(error);
    }
  }

  if (failed > 0) {
    throw new Error(`${name}: ${failed} test(s) failed`);
  }
}
