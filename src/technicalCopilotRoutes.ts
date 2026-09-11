import { Router } from 'express';
import { requireCapability, UserCapability } from './auth/checkCapability';
import { TechnicalCopilotService } from './ai/technical-copilot/TechnicalCopilotService';
import { TECHNICAL_CONCEPT_CATALOG } from './ai/technical-copilot/ConceptCatalog';

const router = Router();
const copilotService = new TechnicalCopilotService();

router.post(
  '/api/copilot/session',
  requireCapability(UserCapability.TECHNICAL_COPILOT),
  (req: any, res: any) => {
    try {
      const user = req.authUser;
      const session = copilotService.startSession(user.userId);
      res.json({ success: true, session });
    } catch (error: any) {
      console.error('[Copilot] Error starting session:', error);
      res.json({ success: false, error: error.message });
    }
  }
);

router.post(
  '/api/copilot/transcript',
  requireCapability(UserCapability.TECHNICAL_COPILOT),
  (req: any, res: any) => {
    try {
      const { sessionId, text, speaker } = req.body;

      if (!sessionId || !text) {
        return res.json({
          success: false,
          error: 'sessionId and text are required',
        });
      }

      const user = req.authUser;
      const session = copilotService.getSession(sessionId);
      if (!session || session.userId !== user.userId) {
        return res.json({
          success: false,
          error: 'Invalid session',
        });
      }

      const result = copilotService.processTranscriptFragment(
        sessionId,
        text,
        speaker
      );

      if (!result) {
        return res.json({
          success: true,
          cue: null,
          message: 'Fragment processed, no technical topic detected',
        });
      }

      res.json({
        success: true,
        cue: result.cue,
        processingTimeMs: result.processingTimeMs,
      });
    } catch (error: any) {
      console.error('[Copilot] Error processing transcript:', error);
      res.json({ success: false, error: error.message });
    }
  }
);

router.post(
  '/api/copilot/batch',
  requireCapability(UserCapability.TECHNICAL_COPILOT),
  (req: any, res: any) => {
    try {
      const { sessionId, fragments } = req.body;

      if (!sessionId || !Array.isArray(fragments)) {
        return res.json({
          success: false,
          error: 'sessionId and fragments array are required',
        });
      }

      const user = req.authUser;
      const session = copilotService.getSession(sessionId);
      if (!session || session.userId !== user.userId) {
        return res.json({
          success: false,
          error: 'Invalid session',
        });
      }

      const result = copilotService.submitTranscriptBatch(sessionId, fragments);

      res.json({
        success: true,
        cue: result?.cue || null,
        processingTimeMs: result?.processingTimeMs || 0,
      });
    } catch (error: any) {
      console.error('[Copilot] Error processing batch:', error);
      res.json({ success: false, error: error.message });
    }
  }
);

router.get(
  '/api/copilot/session/:sessionId',
  requireCapability(UserCapability.TECHNICAL_COPILOT),
  (req: any, res: any) => {
    try {
      const user = req.authUser;
      const session = copilotService.getSession(req.params.sessionId);

      if (!session || session.userId !== user.userId) {
        return res.json({ success: false, error: 'Invalid session' });
      }

      res.json({ success: true, session });
    } catch (error: any) {
      console.error('[Copilot] Error getting session:', error);
      res.json({ success: false, error: error.message });
    }
  }
);

router.post(
  '/api/copilot/session/:sessionId/end',
  requireCapability(UserCapability.TECHNICAL_COPILOT),
  (req: any, res: any) => {
    try {
      const user = req.authUser;
      const session = copilotService.getSession(req.params.sessionId);

      if (!session || session.userId !== user.userId) {
        return res.json({ success: false, error: 'Invalid session' });
      }

      const ended = copilotService.endSession(req.params.sessionId);
      res.json({ success: ended });
    } catch (error: any) {
      console.error('[Copilot] Error ending session:', error);
      res.json({ success: false, error: error.message });
    }
  }
);

router.get(
  '/api/copilot/stats',
  requireCapability(UserCapability.TECHNICAL_COPILOT),
  (_req: any, res: any) => {
    try {
      const stats = copilotService.getStats();
      res.json({ success: true, stats });
    } catch (error: any) {
      console.error('[Copilot] Error getting stats:', error);
      res.json({ success: false, error: error.message });
    }
  }
);

router.get(
  '/api/copilot/domains',
  requireCapability(UserCapability.TECHNICAL_COPILOT),
  (_req: any, res: any) => {
    try {
      const domains = [...new Set(TECHNICAL_CONCEPT_CATALOG.map((c) => c.domain))];
      res.json({ success: true, domains });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  }
);

export { router as technicalCopilotRouter };
