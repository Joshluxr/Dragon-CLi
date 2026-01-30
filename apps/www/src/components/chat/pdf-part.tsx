import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PdfPartProps {
  pdfUrl: string;
  filename?: string;
}

export function PdfPart({ pdfUrl, filename }: PdfPartProps) {
  const displayName = filename || "document.pdf";

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = displayName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 bg-muted rounded-md w-fit">
      <FileText className="size-4 text-muted-foreground flex-shrink-0" />
      <span
        className="text-sm font-medium truncate max-w-[200px]"
        title={displayName}
      >
        {displayName}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 flex-shrink-0"
        onClick={handleDownload}
        title="Download PDF"
      >
        <Download className="size-3" />
      </Button>
    </div>
  );
}
