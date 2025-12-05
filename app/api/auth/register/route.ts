// app/api/auth/register/route.ts

import { registerAction } from "@/app/actions/auth";

export async function POST(req: Request) {
  const formData = await req.formData();
  const result = await registerAction(formData);

  return Response.json(result);
}
