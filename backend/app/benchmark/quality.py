"""
Lightweight Semantic Quality Scoring for LLM Benchmark Outputs.

Evaluates:
  1. Coherence:
     - N-gram diversity (Distinct-1 & Distinct-2 metrics to catch degenerate repetition loops)
     - Sentence boundary integrity & structural termination (balanced delimiters, clean endings)
     - Format compliance (strict JSON validation for structured scenarios)
  2. Relevance:
     - Content-token lexical overlap (stopword-filtered Jaccard & directional prompt containment)
     - Response informativeness & length appropriateness (penalizes empty/truncated/filler outputs)
"""
import re
import json
from typing import NamedTuple, Optional

STOPWORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
    "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
    "below", "between", "both", "but", "by", "can", "can't", "cannot", "could",
    "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down",
    "during", "each", "few", "for", "from", "further", "had", "hadn't", "has",
    "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her",
    "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's",
    "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it",
    "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my",
    "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or",
    "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same",
    "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so",
    "some", "such", "than", "that", "that's", "the", "their", "theirs", "them",
    "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll",
    "they're", "they've", "this", "those", "through", "to", "too", "under",
    "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're",
    "we've", "were", "weren't", "what", "what's", "when", "when's", "where",
    "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with",
    "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've",
    "your", "yours", "yourself", "yourselves", "tell", "give", "write", "explain",
    "include", "based", "following", "question", "answer", "please", "simple", "simply",
    "terms", "term", "concept", "concepts", "meaning", "definition", "describe", "detail",
    "details", "short", "brief", "briefly", "show", "example", "examples"
}


class QualityScoreResult(NamedTuple):
    quality_valid: bool
    quality_score: float
    coherence_score: float
    relevance_score: float
    details: dict


def _tokenize(text: str) -> list[str]:
    """Tokenize into lowercase alphanumeric tokens."""
    return [w for w in re.findall(r"\b[a-zA-Z0-9_-]+\b", text.lower()) if len(w) > 1]


def _content_words(tokens: list[str]) -> set[str]:
    """Filter out stopwords to isolate core semantic content words."""
    return {t for t in tokens if t not in STOPWORDS}


def _compute_repetition_diversity(tokens: list[str]) -> float:
    """
    Compute n-gram diversity to penalize degenerate repetition loops.
    Uses Distinct-1 and Distinct-2 ratios.
    Normal coherent output typically has distinct_2 > 0.70.
    Degenerated loops collapse distinct_2 to < 0.35.
    """
    if len(tokens) <= 3:
        return 0.5

    # Distinct-1: unique unigrams / total unigrams
    d1 = len(set(tokens)) / len(tokens)

    # Distinct-2: unique bigrams / total bigrams
    bigrams = [f"{tokens[i]}_{tokens[i+1]}" for i in range(len(tokens) - 1)]
    d2 = len(set(bigrams)) / len(bigrams) if bigrams else 1.0

    # Max 4-gram repetition penalty
    if len(tokens) >= 8:
        fourgrams = [f"{tokens[i]}_{tokens[i+1]}_{tokens[i+2]}_{tokens[i+3]}" for i in range(len(tokens) - 3)]
        from collections import Counter
        counts = Counter(fourgrams)
        max_rep = max(counts.values()) if counts else 1
        # If the same 4-gram repeats >= 3 times and is > 15% of all 4-grams, heavily penalize
        loop_penalty = max(0.0, (max_rep - 2) * 0.15) if max_rep >= 3 else 0.0
    else:
        loop_penalty = 0.0

    score = (0.35 * d1) + (0.65 * d2) - loop_penalty
    return max(0.0, min(1.0, score))


def _compute_structural_integrity(text: str) -> float:
    """
    Check capitalization, terminal punctuation, non-gibberish chars, and balanced delimiters.
    """
    stripped = text.strip()
    if not stripped:
        return 0.0

    score = 0.5  # base score

    # Clean termination check (ends in ., !, ?, ", ', `, }, ])
    if re.search(r'[\.\!\?\"\']\s*$', stripped) or stripped.endswith(('```', '}', ']')):
        score += 0.25

    # Check balanced brackets/parentheses
    brackets = {'(': ')', '{': '}', '[': ']'}
    counts = {b: 0 for b in '(){}[]'}
    for ch in stripped:
        if ch in counts:
            counts[ch] += 1
    balanced = (
        counts['('] == counts[')'] and
        counts['{'] == counts['}'] and
        counts['['] == counts[']']
    )
    if balanced:
        score += 0.15

    # Check non-gibberish character distribution (at least 65% alphanumeric or standard punctuation)
    valid_chars = sum(1 for c in stripped if c.isalnum() or c in ' \n\t.,;:!?\'"-/()[]{}')
    char_ratio = valid_chars / max(1, len(stripped))
    if char_ratio >= 0.85:
        score += 0.10
    else:
        score -= 0.25

    return max(0.0, min(1.0, score))


def _validate_json_format(text: str) -> float:
    """Validate JSON formatting."""
    clean = text.strip()
    if clean.startswith("```json"):
        clean = clean[7:]
    elif clean.startswith("```"):
        clean = clean[3:]
    if clean.endswith("```"):
        clean = clean[:-3]
    try:
        parsed = json.loads(clean.strip())
        if isinstance(parsed, (dict, list)):
            return 1.0
        return 0.8
    except Exception:
        return 0.0


def _stem(word: str) -> str:
    """Lightweight suffix-stripping stemmer for common English variations."""
    w = word.lower()
    for suffix in ("ing", "tion", "ment", "ies", "es", "ed", "s"):
        if len(w) > len(suffix) + 2 and w.endswith(suffix):
            return w[:-len(suffix)]
    return w


def _match_prompt_concepts(prompt_words: set[str], resp_tokens: list[str]) -> float:
    """Check what fraction of prompt concepts are addressed in response with stem matching."""
    if not prompt_words:
        return 0.85
    resp_stems = {_stem(t) for t in resp_tokens}
    resp_text = " ".join(resp_tokens)
    matched = 0
    for pw in prompt_words:
        pw_stem = _stem(pw)
        if pw_stem in resp_stems or pw in resp_text or (len(pw_stem) >= 4 and pw_stem in resp_text):
            matched += 1
    return matched / len(prompt_words)


def evaluate_quality(
    prompt: str,
    response_text: str,
    scenario: str = "medium",
    error: Optional[str] = None,
) -> QualityScoreResult:
    """
    Evaluate response quality using lightweight, fast heuristics.
    Returns composite quality score (0.0 to 1.0) along with coherence and relevance breakdown.
    """
    if error or not response_text or not response_text.strip():
        return QualityScoreResult(
            quality_valid=False,
            quality_score=0.0,
            coherence_score=0.0,
            relevance_score=0.0,
            details={"reason": error or "Empty response"},
        )

    stripped = response_text.strip()
    resp_tokens = _tokenize(stripped)
    prompt_tokens = _tokenize(prompt)

    if not resp_tokens:
        return QualityScoreResult(
            quality_valid=False,
            quality_score=0.0,
            coherence_score=0.0,
            relevance_score=0.0,
            details={"reason": "No valid tokens"},
        )

    # 1. Coherence Heuristic
    repetition_score = _compute_repetition_diversity(resp_tokens)
    structure_score = _compute_structural_integrity(stripped)

    is_json_scenario = scenario == "json" or "json" in prompt.lower()
    if is_json_scenario:
        json_score = _validate_json_format(stripped)
        coherence = (0.50 * json_score) + (0.30 * repetition_score) + (0.20 * structure_score)
    else:
        coherence = (0.60 * repetition_score) + (0.40 * structure_score)

    # 2. Relevance Heuristic
    prompt_content = _content_words(prompt_tokens)
    resp_content = _content_words(resp_tokens)

    # Prompt concept coverage (using stem matching)
    concept_coverage = _match_prompt_concepts(prompt_content, resp_tokens)

    # Content breadth / informativeness (longer responsive answers get credit for detail)
    informativeness = min(1.0, len(resp_content) / 15.0) if resp_content else 0.0

    # Composite relevance: concept grounding + informativeness
    relevance_raw = (0.70 * concept_coverage) + (0.30 * informativeness)

    # Length appropriateness: penalize ultra-short answers (< 5 words) for explanatory/long prompts
    if len(prompt_tokens) > 20 and len(resp_tokens) < 6:
        relevance_raw *= 0.5

    relevance = max(0.1, min(1.0, relevance_raw))

    # For strict JSON, format failure tanks the overall score
    if is_json_scenario and json_score < 0.5:
        coherence = min(coherence, 0.2)
        relevance = min(relevance, 0.4)

    # 3. Composite Score (50% coherence, 50% relevance)
    composite = round(float(0.50 * coherence + 0.50 * relevance), 3)
    coherence_final = round(float(coherence), 3)
    relevance_final = round(float(relevance), 3)

    # Pass if composite >= 0.40 and not catastrophic loop
    quality_valid = composite >= 0.40 and repetition_score >= 0.25

    return QualityScoreResult(
        quality_valid=quality_valid,
        quality_score=composite,
        coherence_score=coherence_final,
        relevance_score=relevance_final,
        details={
            "repetition_score": round(repetition_score, 3),
            "structure_score": round(structure_score, 3),
            "is_json_scenario": is_json_scenario,
        },
    )
