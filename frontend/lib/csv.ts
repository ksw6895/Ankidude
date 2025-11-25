import Papa from "papaparse";

export type Flashcard = {
  front: string;
  back: string;
  tag?: string;
};

export function parseCsvCards(csvText: string): Flashcard[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const dataLines = lines.filter((line) => !line.trim().startsWith("#"));
  const parsed = Papa.parse<string[]>(dataLines.join("\n"), {
    delimiter: ";",
    skipEmptyLines: true
  });
  return (parsed.data as string[][]).map((row) => ({
    front: row[0] ?? "",
    back: row[1] ?? "",
    tag: row[2] ?? ""
  }));
}

export function buildCsv(cards: Flashcard[]): string {
  const meta = ["#separator:Semicolon", "#columns:Front;Back;Tags", "#html:false"];
  const csvRows = Papa.unparse(
    cards.map((card) => [clean(card.front), clean(card.back), clean(card.tag ?? "")]),
    { delimiter: ";" }
  );
  return `${meta.join("\n")}\n${csvRows}`;
}

const clean = (text: string) => text.replace(/\r?\n/g, " / ").trim();
