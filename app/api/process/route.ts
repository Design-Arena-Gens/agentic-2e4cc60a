import { NextResponse } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

type SheetStatus = "queued" | "appended" | "skipped" | "error";

type ResumeResult = {
  fileName: string;
  summary: string;
  sheetStatus: SheetStatus;
  sheetMessage?: string;
};

type PdfParseFn = (data: Buffer | Uint8Array | ArrayBuffer | string) => Promise<{ text: string }>;

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "from",
  "have",
  "this",
  "your",
  "about",
  "will",
  "into",
  "other",
  "their",
  "they",
  "been",
  "were",
  "which",
  "skills",
  "experience",
  "using",
  "years",
  "worked",
  "work",
  "team",
  "project",
  "projects",
  "including",
  "across",
  "over",
  "management",
  "development",
  "professional",
]);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((item): item is File => item instanceof File);

    if (!files.length) {
      return NextResponse.json({ message: "No files uploaded." }, { status: 400 });
    }

    if (files.length > 100) {
      return NextResponse.json({ message: "You can upload a maximum of 100 files per request." }, { status: 400 });
    }

    const sheetId = String(formData.get("sheetId") ?? "").trim();
    const sheetName = String(formData.get("sheetName") ?? "").trim();
    const clientEmail = String(formData.get("clientEmail") ?? "").trim();
    const rawPrivateKey = String(formData.get("privateKey") ?? "").trim();

    if (!sheetId || !sheetName || !clientEmail || !rawPrivateKey) {
      return NextResponse.json({ message: "Missing Google Sheets credentials." }, { status: 400 });
    }

    const privateKey = rawPrivateKey.replace(/\\n/g, "\n");

    const results: ResumeResult[] = [];

    let sheetsClient: ReturnType<typeof google.sheets> | null = null;
    let sheetsBootstrapError: Error | null = null;

    try {
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      await auth.authorize();
      sheetsClient = google.sheets({ version: "v4", auth });
    } catch (error) {
      sheetsBootstrapError = error instanceof Error ? error : new Error("Failed to initialise Google Sheets client.");
    }

    for (const file of files) {
      try {
        const resumeText = await extractResumeText(file);
        const summary = generateSummary(resumeText, file.name);
        const truncatedSummary = summary.length > 1200 ? `${summary.slice(0, 1197)}...` : summary;

        if (sheetsBootstrapError) {
          results.push({
            fileName: file.name,
            summary: truncatedSummary,
            sheetStatus: "error",
            sheetMessage: sheetsBootstrapError.message,
          });
          continue;
        }

        if (!sheetsClient) {
          results.push({
            fileName: file.name,
            summary: truncatedSummary,
            sheetStatus: "skipped",
            sheetMessage: "Sheets client unavailable.",
          });
          continue;
        }

        const timestamp = new Date().toISOString();

        try {
          await sheetsClient.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: `${sheetName}!A:C`,
            valueInputOption: "USER_ENTERED",
            insertDataOption: "INSERT_ROWS",
            requestBody: {
              values: [[file.name, truncatedSummary, timestamp]],
            },
          });

          results.push({
            fileName: file.name,
            summary: truncatedSummary,
            sheetStatus: "appended",
          });
        } catch (sheetError) {
          results.push({
            fileName: file.name,
            summary: truncatedSummary,
            sheetStatus: "error",
            sheetMessage: sheetError instanceof Error ? sheetError.message : "Failed to append to sheet.",
          });
        }
      } catch (processingError) {
        results.push({
          fileName: file.name,
          summary: "Could not extract meaningful text from this file.",
          sheetStatus: "error",
          sheetMessage:
            processingError instanceof Error ? processingError.message : "Unexpected failure while parsing CV.",
        });
      }
    }

    const anyAppended = results.some((resume) => resume.sheetStatus === "appended");

    return NextResponse.json({
      results,
      globalMessage: anyAppended
        ? "CV summaries generated and synced to Google Sheets."
        : "Processed CVs but could not sync to Google Sheets.",
    });
  } catch (error) {
    console.error("CV processing failed:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unexpected error while processing the uploaded CV batch.",
      },
      { status: 500 },
    );
  }
}

async function extractResumeText(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");

  if (isPdf) {
    const pdfParse = await loadPdfParser();
    const parsed = await pdfParse(buffer);
    if (parsed.text?.trim()) {
      return parsed.text;
    }
  }

  return buffer.toString("utf-8");
}

let pdfParserCache: PdfParseFn | null = null;

async function loadPdfParser() {
  if (!pdfParserCache) {
    const module = await import("pdf-parse");
    pdfParserCache = module.default;
  }
  return pdfParserCache;
}

function generateSummary(text: string, fileName: string) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\t/g, " ").trim();
  if (!normalized) {
    return `No readable content detected in ${fileName}.`;
  }

  const condensed = normalized.replace(/\s+/g, " ");
  const sentences = condensed.split(/(?<=[.!?])\s+/).filter(Boolean);
  const headline = sentences.slice(0, 2).join(" ");

  const keywords = extractTopKeywords(condensed, 8);
  const xp = detectYearsExperience(condensed);
  const locations = detectLocations(condensed);

  const sections = [
    headline ? `Overview: ${headline}` : undefined,
    xp ? `Experience: ${xp}` : undefined,
    keywords.length ? `Highlighted strengths: ${keywords.join(", ")}` : undefined,
    locations.length ? `Locations: ${locations.join(", ")}` : undefined,
  ].filter(Boolean);

  return sections.join("\n");
}

function extractTopKeywords(text: string, limit: number) {
  const words = text
    .toLowerCase()
    .match(/[a-z][a-z+\-#]{1,}/g)
    ?.filter((word) => !STOP_WORDS.has(word) && word.length > 2);

  if (!words?.length) {
    return [];
  }

  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word.toUpperCase());
}

function detectYearsExperience(text: string) {
  const matches = text.match(/(\d{1,2})\s*(?:\+?\s*)?(?:years?|yrs?)\s+of\s+(?:overall\s+)?experience/i);
  if (matches?.[1]) {
    return `${matches[1]} years of experience`;
  }
  const fallback = text.match(/(\d{1,2})\s*(?:\+?\s*)?(?:years?|yrs?)/i);
  if (fallback?.[1]) {
    return `${fallback[1]} years (matched mention)`;
  }
  return undefined;
}

function detectLocations(text: string) {
  const pattern = /\b(?:based in|located in|residing in|from)\s+([A-Z][A-Za-z\s]+)/gi;
  const locations = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    locations.add(match[1].trim());
  }
  return Array.from(locations).slice(0, 3);
}
