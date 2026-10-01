"""
Prometheus text exposition format parser.

Parses Prometheus metrics without external dependencies:
- Supports gauges, counters, and histograms
- Normalizes counter names by stripping trailing '_total'
- Extracts labels (e.g. model_name, finished_reason, le)
- Groups histogram buckets, sum, and count
"""
from dataclasses import dataclass, field
import re
from typing import Any, Dict, List, Optional


@dataclass
class MetricSample:
    name: str
    labels: Dict[str, str] = field(default_factory=dict)
    value: float = 0.0


@dataclass
class HistogramMetric:
    name: str
    labels: Dict[str, str] = field(default_factory=dict)
    buckets: List[tuple[float, float]] = field(default_factory=list)  # (le, cumulative_count)
    sum: float = 0.0
    count: float = 0.0


@dataclass
class ParsedPrometheusMetrics:
    gauges: Dict[str, List[MetricSample]] = field(default_factory=dict)
    counters: Dict[str, List[MetricSample]] = field(default_factory=dict)
    histograms: Dict[str, List[HistogramMetric]] = field(default_factory=dict)
    untyped: Dict[str, List[MetricSample]] = field(default_factory=dict)


_LABEL_PATTERN = re.compile(r'([a-zA-Z_][a-zA-Z0-9_]*)=(?:"((?:\\.|[^\\"])*)"|([^, ]*))')


def parse_labels(labels_str: str) -> Dict[str, str]:
    """Parse comma-separated key="value" labels."""
    if not labels_str:
        return {}
    labels = {}
    for match in _LABEL_PATTERN.finditer(labels_str):
        key = match.group(1)
        val = match.group(2) if match.group(2) is not None else match.group(3)
        # Unescape standard escape sequences
        val = val.replace('\\"', '"').replace('\\n', '\n').replace('\\\\', '\\')
        labels[key] = val
    return labels


def parse_line(line: str) -> Optional[tuple[str, Dict[str, str], float]]:
    """
    Parse a single Prometheus metric line into (metric_name, labels, float_value).
    Handles scientific notation, NaN, Inf, +Inf, -Inf.
    """
    line = line.strip()
    if not line or line.startswith('#'):
        return None

    # Find labels if present
    brace_open = line.find('{')
    brace_close = line.rfind('}')

    if brace_open != -1 and brace_close != -1 and brace_close > brace_open:
        metric_name = line[:brace_open].strip()
        labels_str = line[brace_open + 1:brace_close].strip()
        labels = parse_labels(labels_str)
        value_str = line[brace_close + 1:].strip()
    else:
        parts = line.rsplit(None, 1)
        if len(parts) != 2:
            return None
        metric_name = parts[0].strip()
        labels = {}
        value_str = parts[1].strip()

    try:
        if value_str.lower() in ('+inf', 'inf'):
            value = float('inf')
        elif value_str.lower() == '-inf':
            value = float('-inf')
        elif value_str.lower() == 'nan':
            value = float('nan')
        else:
            value = float(value_str)
    except ValueError:
        return None

    return metric_name, labels, value


def parse_prometheus_text(text: str) -> ParsedPrometheusMetrics:
    """
    Parse Prometheus text format into structured gauges, counters, and histograms.
    Normalizes counter names by stripping trailing '_total' for uniform lookups.
    """
    result = ParsedPrometheusMetrics()
    if not text:
        return result

    type_declarations: Dict[str, str] = {}
    # First pass: collect TYPE declarations
    for line in text.splitlines():
        line = line.strip()
        if line.startswith('# TYPE '):
            parts = line.split(None, 3)
            if len(parts) >= 4:
                metric_name = parts[2]
                m_type = parts[3].lower()
                type_declarations[metric_name] = m_type

    # Temporary storage for grouping histogram components
    # Key: (base_name, frozen_labels_without_le) -> {buckets: [...], sum: ..., count: ...}
    hist_groups: Dict[tuple[str, str], Dict[str, Any]] = {}

    for line in text.splitlines():
        parsed = parse_line(line)
        if not parsed:
            continue
        raw_name, labels, value = parsed

        # Determine metric type
        base_name = raw_name
        is_bucket = raw_name.endswith('_bucket')
        is_sum = raw_name.endswith('_sum')
        is_count = raw_name.endswith('_count')

        if is_bucket:
            base_name = raw_name[:-7]
        elif is_sum:
            base_name = raw_name[:-4]
        elif is_count:
            base_name = raw_name[:-6]

        declared_type = type_declarations.get(base_name) or type_declarations.get(raw_name)

        if declared_type == 'histogram' or is_bucket or is_sum or is_count:
            # Group into histogram
            # Strip 'le' from labels to group bucket samples for the same series
            group_labels = {k: v for k, v in labels.items() if k != 'le'}
            label_key = (base_name, tuple(sorted(group_labels.items())))

            if label_key not in hist_groups:
                hist_groups[label_key] = {
                    'name': base_name,
                    'labels': group_labels,
                    'buckets': [],
                    'sum': 0.0,
                    'count': 0.0,
                }

            if is_bucket:
                le_str = labels.get('le', '')
                try:
                    le_val = float('inf') if le_str in ('+Inf', 'Inf') else float(le_str)
                except ValueError:
                    le_val = float('inf')
                hist_groups[label_key]['buckets'].append((le_val, value))
            elif is_sum:
                hist_groups[label_key]['sum'] = value
            elif is_count:
                hist_groups[label_key]['count'] = value
            continue

        sample = MetricSample(name=raw_name, labels=labels, value=value)

        # Counter normalization: strip '_total' suffix
        norm_name = raw_name
        if norm_name.endswith('_total'):
            norm_name = norm_name[:-6]

        if declared_type == 'counter':
            result.counters.setdefault(norm_name, []).append(sample)
            if norm_name != raw_name:
                result.counters.setdefault(raw_name, []).append(sample)
        elif declared_type == 'gauge':
            result.gauges.setdefault(raw_name, []).append(sample)
        else:
            # If not declared, classify by name convention or store in untyped
            if raw_name.endswith('_total'):
                result.counters.setdefault(norm_name, []).append(sample)
            result.untyped.setdefault(raw_name, []).append(sample)

    # Finalize histograms (sort buckets by le ascending)
    for group in hist_groups.values():
        buckets = sorted(group['buckets'], key=lambda x: x[0])
        hist_metric = HistogramMetric(
            name=group['name'],
            labels=group['labels'],
            buckets=buckets,
            sum=group['sum'],
            count=group['count'],
        )
        result.histograms.setdefault(group['name'], []).append(hist_metric)

    return result
