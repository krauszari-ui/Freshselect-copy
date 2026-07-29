/**
 * CreateTaskFromMessageDialog
 *
 * Opens a pre-filled "Create Task" dialog from any chat message.
 * The message content is used as the default description; the user can
 * edit the title, description, assignee, due date, and priority before
 * submitting.
 */
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, ClipboardList } from "lucide-react";

export interface CreateTaskFromMessageProps {
  open: boolean;
  onClose: () => void;
  /** The chat message content to pre-fill the description */
  messageContent: string;
  /** ID of the message (for sourceMessageId) */
  messageId: number;
  /** 'client' | 'org_group' */
  messageType: "client" | "org_group";
  /** The submission/client this task should be linked to */
  submissionId: number;
  /** Display name of the client (shown in the dialog header) */
  clientName: string;
  /** Called after the task is successfully created, with the new task ID */
  onCreated?: (taskId: number) => void;
}

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low", color: "text-slate-500" },
  { value: "normal", label: "Normal", color: "text-blue-600" },
  { value: "high", label: "High", color: "text-orange-500" },
  { value: "urgent", label: "Urgent", color: "text-red-600" },
] as const;

const AREA_OPTIONS = [
  { value: "intake_rep", label: "Intake Rep" },
  { value: "assigned_worker", label: "Assigned Worker" },
] as const;

export function CreateTaskFromMessageDialog({
  open,
  onClose,
  messageContent,
  messageId,
  messageType,
  submissionId,
  clientName,
  onCreated,
}: CreateTaskFromMessageProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [area, setArea] = useState<"intake_rep" | "assigned_worker">("intake_rep");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [dueDate, setDueDate] = useState("");

  // Pre-fill from message content when dialog opens
  useEffect(() => {
    if (open) {
      const cleaned = messageContent.replace(/@\w+/g, "").trim();
      setTitle(cleaned.slice(0, 80));
      setDescription(cleaned);
      setArea("intake_rep");
      setAssignedTo("");
      setPriority("normal");
      setDueDate("");
    }
  }, [open, messageContent]);

  const { data: staffList } = trpc.admin.staffList.useQuery(undefined, { enabled: open });

  const createMutation = trpc.admin.tasks.create.useMutation({
    onSuccess: (data: { success: boolean; id: number }) => {
      toast.success("Task created successfully");
      onCreated?.(data.id);
      onClose();
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Failed to create task");
    },
  });

  const handleSubmit = () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    createMutation.mutate({
      submissionId,
      title: title.trim(),
      description: description.trim(),
      area,
      assignedTo: assignedTo ? parseInt(assignedTo) : undefined,
      priority,
      dueDate: dueDate || undefined,
      sourceMessageId: messageId,
      sourceMessageType: messageType,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-blue-600" />
            Create Task from Message
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            For client: <span className="font-medium text-foreground">{clientName}</span>
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title <span className="text-red-500">*</span></Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short task title…"
              maxLength={256}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Description</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Task details…"
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">Pre-filled from the message. Edit as needed.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Area */}
            <div className="space-y-1.5">
              <Label>Area</Label>
              <Select value={area} onValueChange={(v) => setArea(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AREA_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className={o.color}>{o.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Assignee */}
            <div className="space-y-1.5">
              <Label>Assign to</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {(staffList ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Due date */}
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !title.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {createMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Creating…</>
            ) : (
              "Create Task"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
