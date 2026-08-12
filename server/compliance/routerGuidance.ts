/**
 * Guidance & clarification library sub-router.
 *
 * Attorney-client privileged / work-product records (privileged guidance,
 * clarifications, and all legal reviews) are only returned to callers holding
 * PRIVILEGED_VIEW — enforced here, not just hidden in the UI.
 */
import { z } from "zod";
import { router } from "../_core/trpc";
import { PERMISSIONS } from "@shared/compliance/constants";
import { permProcedure, actorFromCtx, callerHasPermission } from "./procedures";
import * as g from "./store3";
import { filterPrivileged } from "./guidance";

const clarStateEnum = z.enum(["submitted", "facts_recorded", "legal_requested", "sent_to_agency", "answered", "interpreted", "closed"]);

export const guidanceRouter = router({
  list: permProcedure(PERMISSIONS.GUIDANCE_VIEW).query(async ({ ctx }) => {
    const canPriv = await callerHasPermission(ctx.user, PERMISSIONS.PRIVILEGED_VIEW);
    return filterPrivileged(await g.listGuidance(), canPriv);
  }),
  create: permProcedure(PERMISSIONS.GUIDANCE_MANAGE).input(z.object({
    title: z.string().min(2).max(256),
    sourceOrganization: z.string().max(128).optional(),
    sourceType: z.enum(["cms", "nysdoh_ohip", "omig", "scn", "mco", "contract", "attorney", "consultant", "other"]).optional(),
    privileged: z.boolean().optional(),
    summary: z.string().max(4000).optional(),
    sourceUrl: z.string().url().max(512).optional(),
    section: z.string().max(128).optional(),
    effectiveDate: z.coerce.date().optional(),
  })).mutation(({ input, ctx }) => g.createGuidance(actorFromCtx(ctx), input)),

  clarifications: router({
    list: permProcedure(PERMISSIONS.GUIDANCE_VIEW).query(async ({ ctx }) => {
      const canPriv = await callerHasPermission(ctx.user, PERMISSIONS.PRIVILEGED_VIEW);
      return filterPrivileged(await g.listClarifications(), canPriv);
    }),
    create: permProcedure(PERMISSIONS.GUIDANCE_MANAGE).input(z.object({
      question: z.string().min(5).max(4000),
      facts: z.string().max(4000).optional(),
      submissionId: z.number().int().positive().optional(),
      requirementVersionId: z.number().int().positive().optional(),
      privileged: z.boolean().optional(),
    })).mutation(({ input, ctx }) => g.createClarification(actorFromCtx(ctx), input)),
    advance: permProcedure(PERMISSIONS.GUIDANCE_MANAGE).input(z.object({
      id: z.number().int().positive(), to: clarStateEnum,
      sentToOrganization: z.string().max(128).optional(),
      controllingGuidanceId: z.number().int().positive().optional(),
    })).mutation(({ input, ctx }) => g.advanceClarification(actorFromCtx(ctx), input.id, input.to, { sentToOrganization: input.sentToOrganization, controllingGuidanceId: input.controllingGuidanceId })),
    recordResponse: permProcedure(PERMISSIONS.GUIDANCE_MANAGE).input(z.object({
      clarificationRequestId: z.number().int().positive(),
      organization: z.string().max(128).optional(),
      responseType: z.enum(["formal", "informal"]).optional(),
      documentId: z.number().int().positive().optional(),
      summary: z.string().max(4000).optional(),
    })).mutation(({ input, ctx }) => g.recordAgencyResponse(actorFromCtx(ctx), input)),
  }),

  legalReview: router({
    // Requesting/viewing legal review requires the attorney-privilege permission.
    request: permProcedure(PERMISSIONS.LEGAL_REVIEW).input(z.object({
      clarificationRequestId: z.number().int().positive().optional(),
      requirementVersionId: z.number().int().positive().optional(),
      summary: z.string().max(4000).optional(),
    })).mutation(({ input, ctx }) => g.requestLegalReview(actorFromCtx(ctx), input)),
    list: permProcedure(PERMISSIONS.PRIVILEGED_VIEW).query(() => g.listLegalReviews()),
  }),

  decisions: router({
    approve: permProcedure(PERMISSIONS.GUIDANCE_MANAGE).input(z.object({
      clarificationRequestId: z.number().int().positive().optional(),
      interpretation: z.string().min(5).max(4000),
      basis: z.string().max(4000).optional(),
      authorId: z.number().int().positive().optional(),
    })).mutation(({ input, ctx }) => g.approveInternalDecision(actorFromCtx(ctx), input)),
    recordImpact: permProcedure(PERMISSIONS.GUIDANCE_MANAGE).input(z.object({
      internalDecisionId: z.number().int().positive(),
      requirementVersionId: z.number().int().positive().optional(),
      affectedSubmissionId: z.number().int().positive().optional(),
      affectedInvoiceId: z.number().int().positive().optional(),
      note: z.string().max(2000).optional(),
    })).mutation(({ input, ctx }) => g.recordPolicyImpact(actorFromCtx(ctx), input)),
    acknowledgeTraining: permProcedure(PERMISSIONS.GUIDANCE_VIEW).input(z.object({
      internalDecisionId: z.number().int().positive().optional(),
      guidanceDocumentId: z.number().int().positive().optional(),
    })).mutation(({ input, ctx }) => g.acknowledgeTraining(actorFromCtx(ctx), input)),
  }),
});
