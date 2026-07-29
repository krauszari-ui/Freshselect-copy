import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Upload, Loader2, FileText, Download, FolderOpen,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useOpenDocument } from "@/hooks/useOpenDocument";
import { toast } from "sonner";

const CATEGORY_LABELS: Record<string, string> = {
  provider_attestation: "Provider Attestation",
  consent: "Consent Forms",
  supporting_documentation: "Supporting Documentation",
  id_document: "ID Documents",
  medicaid_card: "Medicaid Cards",
  birth_certificate: "Birth Certificates",
  marriage_license: "Marriage Licenses",
  forms: "Forms",
  uncategorized: "Uncategorized",
};

export default function AdminDocuments() {
  const utils = trpc.useUtils();
  const { openDocument, loading: docOpenLoading } = useOpenDocument();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadData, setUploadData] = useState({ category: "uncategorized" as string, fileName: "" });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const docsQuery = trpc.admin.documents.library.useQuery(
    categoryFilter !== "all" ? { category: categoryFilter } : undefined
  );

  const uploadMutation = trpc.admin.documents.upload.useMutation({
    onSuccess: () => {
      utils.admin.documents.library.invalidate();
      setShowUpload(false);
      setUploadData({ category: "uncategorized", fileName: "" });
      toast.success("Document uploaded");
    },
  });

  const docs = (docsQuery.data ?? []) as any[];

  const handleFileUpload = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error("Please select a file"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("File must be under 10 MB"); return; }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate(
        {
          name: uploadData.fileName || file.name,
          category: uploadData.category as any,
          fileData: base64,
          contentType: file.type || "application/octet-stream",
          submissionId: null,
        },
        { onSettled: () => setUploading(false) }
      );
    };
    reader.onerror = () => {
      toast.error("Failed to read file. Please try again.");
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <AdminLayout>
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Document Library</h1>
            <p className="text-slate-500 text-sm mt-0.5">{docs.length} documents available</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 h-9" onClick={() => setShowUpload(true)}>
            <Upload className="h-4 w-4" /> Upload Document
          </Button>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Filter by:</span>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px] h-9 text-sm bg-white border-slate-200">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Document List */}
        {docsQuery.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
        ) : docs.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <FolderOpen className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="text-sm">No documents found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((doc: any) => (
              <div key={doc.id} className="bg-white rounded-lg border border-slate-200 p-4 flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <button
                      onClick={() => openDocument(doc.fileKey || doc.fileUrl || doc.url, null)}
                      disabled={docOpenLoading === (doc.fileKey || doc.fileUrl || doc.url)}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline text-left disabled:opacity-60"
                    >
                      {doc.fileName || doc.name}
                    </button>
                    {doc.description && (
                      <p className="text-xs text-slate-500 mt-0.5">{doc.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0">
                        {CATEGORY_LABELS[doc.category] || doc.category}
                      </Badge>
                      <span className="text-xs text-slate-400">
                        by {doc.uploaderName || doc.uploadedByEmail || "staff"}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => openDocument(doc.fileKey || doc.fileUrl || doc.url, null)}
                  disabled={docOpenLoading === (doc.fileKey || doc.fileUrl || doc.url)}
                  title="Download document"
                  className="disabled:opacity-60"
                >
                  {docOpenLoading === (doc.fileKey || doc.fileUrl || doc.url)
                    ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    : <Download className="h-4 w-4 text-slate-400 hover:text-slate-600" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload Document Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Category</label>
              <Select value={uploadData.category} onValueChange={(v) => setUploadData({ ...uploadData, category: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Document Name (optional)</label>
              <Input
                placeholder="Leave blank to use file name"
                value={uploadData.fileName}
                onChange={(e) => setUploadData({ ...uploadData, fileName: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
            <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
              <Upload className="h-8 w-8 text-slate-400 mb-2" />
              <span className="text-sm text-slate-500">Click to select a file</span>
              <span className="text-xs text-slate-400 mt-1">{fileRef.current?.files?.[0]?.name || "No file selected"}</span>
              <input ref={fileRef} type="file" className="hidden" onChange={() => {}} />
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowUpload(false)}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleFileUpload}
              disabled={uploading || uploadMutation.isPending}
            >
              {(uploading || uploadMutation.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
