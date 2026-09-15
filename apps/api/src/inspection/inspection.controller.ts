import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { CreateInspectionRequest, CreateEvidenceUploadRequest, CommitEvidenceRequest, FindingReview, SubmitReviewRequest } from "@inspectai/contracts";
import { z } from "zod";
import { ZodValidationPipe } from "../shared/zod.pipe.js";
import { InspectionService } from "./inspection.service.js";
import { CurrentUser, type Principal } from "../auth/principal.js";

// Schema for review request body (without inspectionId which comes from the path)
const ReviewRequestBodySchema = z.object({
  findingReviews: z.array(FindingReview).min(1),
  overallNote: z.string().optional(),
}).superRefine((req, ctx) => {
  for (const [i, fr] of req.findingReviews.entries()) {
    if (fr.decision === "AMENDED" && !fr.amendedObservation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["findingReviews", i, "amendedObservation"],
        message: "amendedObservation is required when a finding decision is AMENDED",
      });
    }
  }
});

@Controller()
export class InspectionController {
  constructor(@Inject(InspectionService) private readonly inspections: InspectionService) {}

  @Get("inspections")
  listInspections(
    @CurrentUser() principal: Principal,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const opts: { status?: string; limit?: number; offset?: number } = {};
    if (status) opts.status = status;
    if (limit) opts.limit = Math.max(1, parseInt(limit));
    if (offset) opts.offset = Math.max(0, parseInt(offset));
    return this.inspections.listInspections(principal, opts);
  }

  @Post("tenancies/:id/inspections")
  @HttpCode(201)
  createInspection(
    @CurrentUser() principal: Principal,
    @Param("id") tenancyId: string,
    @Body(new ZodValidationPipe(CreateInspectionRequest)) dto: CreateInspectionRequest,
  ) {
    return this.inspections.createInspection(principal, tenancyId, dto);
  }

  @Get("inspections/:id")
  getInspection(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.inspections.getInspection(principal, id);
  }

  @Post("inspections/:id/analyze")
  @HttpCode(202)
  requestAnalysis(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.inspections.requestAnalysis(principal, id);
  }

  @Post("inspections/:id/review")
  @HttpCode(200)
  submitReview(
    @CurrentUser() principal: Principal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ReviewRequestBodySchema)) dto: z.infer<typeof ReviewRequestBodySchema>,
  ) {
    return this.inspections.submitReview(principal, id, { ...dto, inspectionId: id } as SubmitReviewRequest);
  }

  @Post("inspections/:id/report")
  @HttpCode(202)
  requestReport(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.inspections.requestReport(principal, id);
  }

  @Get("reports/:id/download")
  downloadReport(@CurrentUser() principal: Principal, @Param("id") reportId: string) {
    return this.inspections.downloadReport(principal, reportId);
  }

  @Post("inspections/:id/evidence")
  @HttpCode(201)
  createEvidenceUploadTicket(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(CreateEvidenceUploadRequest)) dto: CreateEvidenceUploadRequest,
  ) {
    return this.inspections.createEvidenceUploadTicket(principal, dto);
  }

  @Post("evidence/:id/commit")
  @HttpCode(200)
  commitEvidence(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(CommitEvidenceRequest)) dto: CommitEvidenceRequest,
  ) {
    return this.inspections.commitEvidence(principal, dto);
  }

  @Post("inspections/:id/submit")
  @HttpCode(200)
  submitInspection(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.inspections.submitInspection(principal, id);
  }
}
