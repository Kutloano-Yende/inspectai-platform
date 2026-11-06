"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircle2Icon, CameraIcon } from "lucide-react";
import type { CreateEvidenceUploadRequest } from "@inspectai/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  useMyInvitation,
  useAcceptInvitation,
  useTenantInspection,
  useCreateEvidenceTicket,
  useCommitEvidence,
  useSubmitTenantInspection,
  putEvidenceFile,
  sha256Hex,
  readGeolocation,
} from "@/lib/hooks/useTenantCapture";
import type { ApiError } from "@/lib/api";

interface InvitePageProps {
  params: { token: string };
}

export default function InvitePage({ params }: InvitePageProps) {
  const { token } = params;
  const { data: invite, isLoading, error } = useMyInvitation(token);
  const accept = useAcceptInvitation(token);
  const [submitted, setSubmitted] = useState(false);

  if (isLoading) {
    return (
      <Centered>
        <Spinner className="size-6 text-muted-foreground" />
      </Centered>
    );
  }

  if (error) {
    const status = (error as ApiError).status;
    return (
      <Centered>
        <Card className="w-full max-w-sm">
          <CardPanel className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="font-semibold text-navy">This link isn&apos;t valid</p>
            <p className="text-sm text-muted-foreground">
              {status === 401
                ? "This invitation link has expired, been used up, or revoked. Ask your landlord to send a new one."
                : "Something went wrong opening this invitation. Please try again."}
            </p>
          </CardPanel>
        </Card>
      </Centered>
    );
  }

  if (!invite) return null;

  if (submitted || invite.inspection?.status === "SUBMITTED" || (invite.inspection && !["DRAFT", "IN_PROGRESS"].includes(invite.inspection.status))) {
    return (
      <Centered>
        <Card className="w-full max-w-sm">
          <CardPanel className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2Icon className="size-10 text-success" />
            <p className="font-semibold text-navy">Submitted — thank you</p>
            <p className="text-sm text-muted-foreground">
              Your photos have been sent to {invite.property.displayName}&apos;s landlord for review.
            </p>
          </CardPanel>
        </Card>
      </Centered>
    );
  }

  if (invite.invitation.status === "PENDING") {
    return (
      <Centered>
        <Card className="w-full max-w-sm">
          <CardPanel className="flex flex-col items-center gap-3 py-10 text-center">
            <CameraIcon className="size-10 text-primary" />
            <p className="font-semibold text-navy">Hi {firstName(invite.invitation.tenantFullName)},</p>
            <p className="text-sm text-muted-foreground">
              You&apos;ve been asked to photograph a few spots at {invite.property.displayName} for your move-out
              inspection. It only takes a few minutes — just your camera, no account needed.
            </p>
            {accept.isError && (
              <p className="text-sm text-destructive-foreground">{(accept.error as Error).message}</p>
            )}
            <Button className="mt-2 w-full" loading={accept.isPending} onClick={() => accept.mutate()}>
              Begin Inspection
            </Button>
          </CardPanel>
        </Card>
      </Centered>
    );
  }

  if (invite.inspection && invite.inspection.status === "IN_PROGRESS") {
    return (
      <Centered>
        <CaptureFlow
          token={token}
          inspectionId={invite.inspection.id}
          propertyName={invite.property.displayName}
          onSubmitted={() => setSubmitted(true)}
        />
      </Centered>
    );
  }

  return (
    <Centered>
      <Card className="w-full max-w-sm">
        <CardPanel className="py-8 text-center text-sm text-muted-foreground">
          This inspection isn&apos;t ready for capture yet. Please check back shortly.
        </CardPanel>
      </Card>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-sand px-4 py-8">
      {children}
    </main>
  );
}

function firstName(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}

interface FlatCheckpoint {
  id: string;
  roomLabel: string;
  prompt: string;
  mandatory: boolean;
}

function CaptureFlow({
  token,
  inspectionId,
  propertyName,
  onSubmitted,
}: {
  token: string;
  inspectionId: string;
  propertyName: string;
  onSubmitted: () => void;
}) {
  const { data: inspection, isLoading } = useTenantInspection(token, inspectionId);
  const createTicket = useCreateEvidenceTicket(token, inspectionId);
  const commitEvidence = useCommitEvidence(token, inspectionId);
  const submitInspection = useSubmitTenantInspection(token, inspectionId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const checkpoints = useMemo<FlatCheckpoint[]>(() => {
    if (!inspection) return [];
    return inspection.plan.rooms.flatMap((room) =>
      room.checkpoints.map((cp) => ({ id: cp.id, roomLabel: room.label, prompt: cp.prompt, mandatory: cp.mandatory })),
    );
  }, [inspection]);

  // Mirrors packages/domain's checkSubmissionReadiness for display only; the server is authoritative.
  const passedCheckpointIds = useMemo(() => {
    const byCheckpoint = new Map<string, boolean>();
    for (const e of inspection?.evidence ?? []) {
      const passes = !!e.committedAt && e.verification.freshnessVerified && !e.verification.duplicateDetected && e.verification.qualityAcceptable;
      byCheckpoint.set(e.checkpointId, passes);
    }
    return byCheckpoint;
  }, [inspection?.evidence]);

  if (isLoading || !inspection) {
    return <Spinner className="size-6 text-muted-foreground" />;
  }

  const mandatoryDone = checkpoints.filter((c) => c.mandatory).every((c) => passedCheckpointIds.get(c.id));
  const current = checkpoints[activeIndex];
  const isLastCheckpoint = activeIndex === checkpoints.length - 1;

  const handleFile = async (file: File) => {
    if (!current) return;
    setCaptureError(null);
    try {
      const [contentSha256, gps] = await Promise.all([sha256Hex(file), readGeolocation()]);
      const ticket = await createTicket.mutateAsync({
        inspectionId,
        checkpointId: current.id,
        kind: "PHOTO",
        contentSha256,
        contentLengthBytes: file.size,
        contentType: file.type || "image/jpeg",
        capturedAt: new Date().toISOString(),
        ...(gps ? { gps } : {}),
        deviceMetadata: { userAgent: navigator.userAgent, platform: navigator.platform ?? "unknown" },
      } as unknown as CreateEvidenceUploadRequest);
      await putEvidenceFile(ticket.uploadUrl, file);
      const committed = await commitEvidence.mutateAsync({ evidenceId: ticket.evidenceId, captureNonce: ticket.captureNonce });
      const passes = committed.verification.freshnessVerified && !committed.verification.duplicateDetected && committed.verification.qualityAcceptable;
      if (!passes) {
        setCaptureError("That photo couldn't be verified — please retake it.");
      }
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : "Upload failed — please try again.");
    }
  };

  const handleSubmit = async () => {
    await submitInspection.mutateAsync();
    onSubmitted();
  };

  if (!current) return null;

  const isWorking = createTicket.isPending || commitEvidence.isPending;
  const alreadyCaptured = passedCheckpointIds.get(current.id) === true;

  return (
    <Card className="w-full max-w-sm">
      <CardPanel className="flex flex-col gap-5 py-8">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{propertyName}</span>
          <span>
            {activeIndex + 1} of {checkpoints.length}
          </span>
        </div>

        <div className="flex flex-col gap-1 text-center">
          <p className="text-sm font-medium text-muted-foreground">{current.roomLabel}</p>
          <p className="font-semibold text-navy">{current.prompt}</p>
          {!current.mandatory && <p className="text-xs text-muted-foreground">Optional</p>}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />

        {alreadyCaptured ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <CheckCircle2Icon className="size-8 text-success" />
            <p className="text-sm text-muted-foreground">Captured</p>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isWorking}>
              Retake
            </Button>
          </div>
        ) : (
          <Button
            className="w-full"
            loading={isWorking}
            onClick={() => fileInputRef.current?.click()}
          >
            <CameraIcon className="mr-1" /> Take Photo
          </Button>
        )}

        {captureError && <p className="text-center text-sm text-destructive-foreground">{captureError}</p>}

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            disabled={activeIndex === 0}
            onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
          >
            Back
          </Button>
          {isLastCheckpoint ? (
            <Button
              size="sm"
              disabled={!mandatoryDone}
              loading={submitInspection.isPending}
              onClick={handleSubmit}
            >
              Submit Inspection
            </Button>
          ) : (
            <Button
              variant={alreadyCaptured || !current.mandatory ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveIndex((i) => Math.min(checkpoints.length - 1, i + 1))}
            >
              {alreadyCaptured || !current.mandatory ? "Next" : "Skip for now"}
            </Button>
          )}
        </div>
      </CardPanel>
    </Card>
  );
}
