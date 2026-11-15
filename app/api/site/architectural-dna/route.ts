import { readFile, writeFile } from "fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { parseArchitecturalDna } from "@/lib/skill5/architectural-dna";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "data", "skill5", "architectural-dna.json");

async function readDocument() {
  const raw = await readFile(FILE, "utf8");
  return parseArchitecturalDna(JSON.parse(raw) as unknown);
}

export async function GET() {
  try {
    const document = await readDocument();
    if (!document) return NextResponse.json({ error: "The architectural DNA record is incomplete." }, { status: 500 });
    return NextResponse.json(document);
  } catch {
    return NextResponse.json({ error: "The architectural DNA record could not be read." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const document = parseArchitecturalDna(await request.json() as unknown);
  if (!document) return NextResponse.json({ error: "The architectural DNA record is incomplete." }, { status: 400 });
  await writeFile(FILE, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return NextResponse.json(document);
}
