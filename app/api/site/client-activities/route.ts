import { readFile, writeFile } from "fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { parseClientCompatibility } from "@/lib/skill5/client-compatibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "data", "skill5", "client-activities.json");

async function readDocument() {
  const raw = await readFile(FILE, "utf8");
  return parseClientCompatibility(JSON.parse(raw) as unknown);
}

export async function GET() {
  try {
    const document = await readDocument();
    if (!document) return NextResponse.json({ error: "The client activity record is incomplete." }, { status: 500 });
    return NextResponse.json(document);
  } catch {
    return NextResponse.json({ error: "The client activity record could not be read." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const document = parseClientCompatibility(await request.json() as unknown);
  if (!document) return NextResponse.json({ error: "The client activity record is incomplete." }, { status: 400 });
  await writeFile(FILE, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return NextResponse.json(document);
}
