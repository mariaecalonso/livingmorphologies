import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { emptyConfigurationDocument, parseConfigurationDocument } from "@/lib/skill5/configurations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "data", "skill5", "configurations.json");

async function readDocument() {
  try {
    const raw = await readFile(FILE, "utf8");
    return parseConfigurationDocument(JSON.parse(raw) as unknown);
  } catch {
    return emptyConfigurationDocument();
  }
}

export async function GET() {
  return NextResponse.json(await readDocument());
}

export async function PUT(request: Request) {
  const body = parseConfigurationDocument(await request.json() as unknown);
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  return NextResponse.json(body);
}
