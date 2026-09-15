import PDFDocument from "pdfkit";

const NAVY = "#17324D";
const SLATE = "#334E68";
const TEAL = "#287D76";
const MUTED = "#6B7A8C";

const SEVERITY_COLOR: Record<string, string> = { LOW: MUTED, MEDIUM: "#B26B00", HIGH: "#A63A3A" };

/** Renders the report model as a calm, professional PDF using InspectAI palette. */
export function renderReportPdf(model: {
  property: { displayName: string; addressLine1: string; city: string; province: string } | null;
  unit: { label: string } | null;
  inspection: { id: string; type: string; submittedAt: Date | null };
  findings: Array<{ category: string; severity: string; confidence: number; observation: string; amended: boolean; evidenceCount: number }>;
  summary: string;
  publishedBy: { fullName: string; email: string };
  publishedAt: Date;
  version: number;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 56, compress: false, info: { Title: `InspectAI Condition Report v${model.version}` } });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(18).text("InspectAI — Property Condition Report");
      doc.moveDown(0.2);
      doc.fillColor(MUTED).font("Helvetica").fontSize(9)
        .text(`Report version ${model.version}  ·  Published ${model.publishedAt.toISOString().slice(0, 10)}`);
      doc.moveDown(1);

      if (model.property) {
        doc.fillColor(SLATE).font("Helvetica-Bold").fontSize(12).text(model.property.displayName);
        doc.fillColor(MUTED).font("Helvetica").fontSize(9)
          .text(`${model.property.addressLine1}, ${model.property.city}, ${model.property.province}${model.unit ? ` — ${model.unit.label}` : ""}`);
        doc.moveDown(0.6);
      }
      doc.fillColor(SLATE).font("Helvetica").fontSize(10)
        .text(`Inspection type: ${model.inspection.type.replace("_", "-")}${model.inspection.submittedAt ? `  ·  Submitted ${model.inspection.submittedAt.toISOString().slice(0, 10)}` : ""}`);

      doc.moveTo(56, doc.y + 6).lineTo(539, doc.y + 6).lineWidth(0.5).strokeColor("#D8D4CC").stroke();
      doc.moveDown(1.2);

      // Findings
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(12).text("Reviewed findings");
      doc.moveDown(0.4);

      if (model.findings.length === 0) {
        doc.fillColor(SLATE).font("Helvetica").fontSize(10)
          .text("No findings were accepted during the landlord review.");
      } else {
        for (const f of model.findings) {
          doc.fillColor(SLATE).font("Helvetica-Bold").fontSize(10)
            .text(`${f.category.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}`, { continued: true })
            .fillColor(SEVERITY_COLOR[f.severity] ?? MUTED)
            .text(`   ${f.severity}${f.amended ? "  ·  amended by landlord" : ""}`);
          doc.fillColor(SLATE).font("Helvetica").fontSize(9.5).text(f.observation, { indent: 12 });
          doc.fillColor(MUTED).fontSize(8)
            .text(`Confidence ${Math.round(f.confidence * 100)}%  ·  ${f.evidenceCount} evidence item(s)`, { indent: 12 });
          doc.moveDown(0.5);
        }
      }

      doc.moveDown(0.8);
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11).text("Analysis summary");
      doc.fillColor(SLATE).font("Helvetica").fontSize(9.5).text(model.summary, { width: 480 });
      doc.moveDown(1.2);

      doc.fillColor(MUTED).font("Helvetica-Oblique").fontSize(8.5)
        .text("AI observations in this report are advisory only. Condition assessments and any related decisions are the responsibility of the reviewing landlord or property manager.");
      doc.text(`Published by ${model.publishedBy.fullName} <${model.publishedBy.email}> via InspectAI.`);
      doc.fillColor(TEAL).text(`Reference: ${model.inspection.id}`);

      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
