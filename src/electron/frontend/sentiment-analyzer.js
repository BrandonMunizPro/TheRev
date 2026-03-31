/**
 * Avatar Reaction System
 *
 * Analyzes content sentiment and triggers appropriate avatar animations
 */

const EmotionKeywords = {
  happy: {
    keywords: [
      'happy',
      'joy',
      'excited',
      'great',
      'amazing',
      'wonderful',
      'love',
      'excellent',
      'success',
      'win',
      'breakthrough',
      'positive',
      'good news',
      'milestone',
      'achievement',
      'celebrate',
      'congratulations',
      'best',
      'fantastic',
      'brilliant',
    ],
    weight: 1.2,
  },
  sad: {
    keywords: [
      'sad',
      'tragic',
      'tragedy',
      'death',
      'died',
      'loss',
      'failed',
      'failure',
      'disappointing',
      'disappointing',
      'terrible',
      'awful',
      'horrible',
      'worst',
      'crisis',
      'disaster',
      'devastating',
      'catastrophe',
      'sorrow',
      'grief',
    ],
    weight: 1.0,
  },
  concerned: {
    keywords: [
      'concern',
      'worried',
      'worry',
      'warning',
      'risk',
      'danger',
      'threat',
      'fear',
      'uncertain',
      'uncertainty',
      'inflation',
      'recession',
      'decline',
      'drop',
      'fell',
      'lost',
      'missing',
      'shortage',
      'crisis',
      'problem',
      'issue',
      'challenge',
      'difficult',
      'hard',
      'tough',
      'struggle',
    ],
    weight: 1.0,
  },
  excited: {
    keywords: [
      'exciting',
      'excited',
      'incredible',
      'unbelievable',
      'shocking',
      'surprising',
      'breaking',
      'just in',
      'announcement',
      'revealed',
      'discovered',
      'found',
      'new',
      'innovation',
      'revolutionary',
      'game-changing',
      'breathtaking',
    ],
    weight: 1.3,
  },
  shocked: {
    keywords: [
      'shocked',
      'stunned',
      'unbelievable',
      'cannot believe',
      'wtf',
      'what the',
      'unexpected',
      'outrageous',
      'insane',
      'crazy',
      'scandal',
      'controversy',
      'bombshell',
      'explosive',
      'alarming',
    ],
    weight: 1.2,
  },
  confused: {
    keywords: [
      'confused',
      'confusing',
      'unclear',
      'uncertain',
      "doesn't make sense",
      'contradictory',
      'mixed',
      'conflicting',
      'strange',
      'weird',
      'odd',
      'complicated',
      'complex',
      'puzzle',
      'mystery',
    ],
    weight: 0.8,
  },
  angry: {
    keywords: [
      'angry',
      'outrage',
      'furious',
      'rage',
      'mad',
      'hate',
      'angry',
      'scandal',
      'corrupt',
      'fraud',
      'scam',
      'lie',
      'lies',
      'dishonest',
      'disgusting',
      'appalling',
      'shameful',
      'unacceptable',
    ],
    weight: 1.1,
  },
  hopeful: {
    keywords: [
      'hope',
      'hopeful',
      'optimistic',
      'promising',
      'potential',
      'could',
      'may',
      'might',
      'possible',
      'likely',
      'probably',
      'upcoming',
      'future',
      'plan',
      'proposal',
      'effort',
      'progress',
    ],
    weight: 0.9,
  },
  neutral: {
    keywords: [
      'update',
      'report',
      'according',
      'stated',
      'said',
      'announced',
      'reported',
      'information',
      'data',
      'fact',
      'figure',
      'number',
      'percent',
      'rate',
    ],
    weight: 0.5,
  },
};

class SentimentAnalyzer {
  constructor() {
    this.lastEmotion = null;
    this.emotionHistory = [];
    this.cooldownMs = 5000; // Don't react to same emotion within 5 seconds
    this.minConfidence = 0.3;
  }

  analyze(text) {
    if (!text) return { emotion: 'neutral', confidence: 0, score: 0 };

    const lowerText = text.toLowerCase();
    const scores = {};
    let totalMatches = 0;

    for (const [emotion, config] of Object.entries(EmotionKeywords)) {
      let emotionScore = 0;
      for (const keyword of config.keywords) {
        if (lowerText.includes(keyword)) {
          emotionScore += config.weight;
          totalMatches++;
        }
      }
      scores[emotion] = emotionScore;
    }

    // Find dominant emotion
    let dominantEmotion = 'neutral';
    let maxScore = 0;
    let totalScore = 0;

    for (const [emotion, score] of Object.entries(scores)) {
      totalScore += score;
      if (score > maxScore) {
        maxScore = score;
        dominantEmotion = emotion;
      }
    }

    // Calculate confidence
    const confidence = totalScore > 0 ? maxScore / totalScore : 0;
    const normalizedScore =
      (totalScore / Math.max(1, lowerText.split(' ').length)) * 10;

    return {
      emotion: confidence >= this.minConfidence ? dominantEmotion : 'neutral',
      confidence: Math.min(confidence, 1),
      score: normalizedScore,
      allScores: scores,
    };
  }

  shouldReact(newEmotion) {
    const now = Date.now();

    // Always react to strong emotions
    if (this.lastEmotion?.emotion !== newEmotion) {
      const timeSinceLastReaction = now - (this.lastEmotion?.timestamp || 0);
      if (timeSinceLastReaction < this.cooldownMs && newEmotion !== 'neutral') {
        return false;
      }
    }

    return true;
  }

  recordEmotion(emotion) {
    this.lastEmotion = {
      emotion,
      timestamp: Date.now(),
    };
    this.emotionHistory.push(this.lastEmotion);

    // Keep only last 10
    if (this.emotionHistory.length > 10) {
      this.emotionHistory.shift();
    }
  }

  getReactionSuggestion(analysis) {
    const { emotion, confidence, score } = analysis;

    if (confidence < this.minConfidence || score < 0.5) {
      return null; // Don't react to weak signals
    }

    if (!this.shouldReact(emotion)) {
      return null;
    }

    return {
      emotion,
      confidence,
      score,
      animationType: this.getAnimationType(emotion),
      urgency: this.getUrgency(emotion, score),
    };
  }

  getAnimationType(emotion) {
    const animationMap = {
      happy: ['Victory', 'Cheering', 'Bling Dance', 'Cat Dance', 'Happy'],
      sad: ['Sitting Disapproval', 'Sitting Talking', 'Sad'],
      concerned: ['Strong Gesture', 'Taunt Gesture', 'Thinking'],
      excited: ['Victory', 'Cheering', 'Brooklyn Uprock', 'Hip Hop Dancing'],
      shocked: ['Taunt', 'Taunt Gesture', 'Surprised'],
      confused: ['Thinking', 'Male Standing Pose', 'Sitting Talking'],
      angry: ['Taunt', 'Taunt Gesture', 'Boxing'],
      hopeful: ['Victory', 'Standing Clap', 'Cheering'],
      neutral: ['Standard Idle', 'Bored', 'Idle Dance'],
    };

    return animationMap[emotion] || animationMap.neutral;
  }

  getUrgency(emotion, score) {
    // High urgency emotions get priority
    const highUrgency = ['shocked', 'angry', 'excited', 'sad'];
    const mediumUrgency = ['concerned', 'hopeful'];

    if (highUrgency.includes(emotion) && score > 1.5) {
      return 'high';
    }
    if (mediumUrgency.includes(emotion) && score > 1) {
      return 'medium';
    }
    return 'low';
  }

  reset() {
    this.lastEmotion = null;
    this.emotionHistory = [];
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.SentimentAnalyzer = SentimentAnalyzer;
  window.EmotionKeywords = EmotionKeywords;
}

module.exports = { SentimentAnalyzer, EmotionKeywords };
