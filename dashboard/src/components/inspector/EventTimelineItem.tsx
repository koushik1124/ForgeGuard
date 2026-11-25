import React, { useState } from 'react';
import { Box, Button, Collapse, IconButton, Typography } from '@mui/material';
import { ChevronDown, ChevronRight, Copy, Check, Terminal, Shield, DollarSign, Activity, Settings } from 'lucide-react';
import { NormalizedEvent } from '../../api/sse/types';
import { tokens } from '../../theme/tokens';

interface EventTimelineItemProps {
  event: NormalizedEvent;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

function getCategoryColor(category: string): { text: string; bg: string; border: string } {
  switch (category) {
    case 'tool':
      return { text: tokens.colors.primary, bg: tokens.colors.primarySubtle, border: 'rgba(124, 140, 255, 0.3)' };
    case 'policy':
      return { text: tokens.colors.warning, bg: tokens.colors.warningSubtle, border: 'rgba(240, 180, 90, 0.3)' };
    case 'budget':
      return { text: tokens.colors.info, bg: tokens.colors.infoSubtle, border: 'rgba(89, 176, 246, 0.3)' };
    case 'lifecycle':
      return { text: tokens.colors.success, bg: tokens.colors.successSubtle, border: 'rgba(53, 201, 138, 0.3)' };
    case 'system':
      return { text: tokens.colors.error, bg: tokens.colors.errorSubtle, border: 'rgba(241, 108, 120, 0.3)' };
    default:
      return { text: tokens.colors.text.secondary, bg: 'rgba(146, 155, 172, 0.1)', border: tokens.colors.borderSubtle };
  }
}

function getCategoryIcon(category: string) {
  switch (category) {
    case 'tool':
      return <Terminal size={13} />;
    case 'policy':
      return <Shield size={13} />;
    case 'budget':
      return <DollarSign size={13} />;
    case 'lifecycle':
      return <Activity size={13} />;
    default:
      return <Settings size={13} />;
  }
}

function getStatusStyle(status?: string): { color: string; bg: string } | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === 'success' || s === 'completed' || s === 'allowed') {
    return { color: tokens.colors.success, bg: tokens.colors.successSubtle };
  }
  if (s === 'failure' || s === 'failed' || s === 'denied' || s === 'rejected') {
    return { color: tokens.colors.error, bg: tokens.colors.errorSubtle };
  }
  if (s === 'running' || s === 'pending') {
    return { color: tokens.colors.primary, bg: tokens.colors.primarySubtle };
  }
  if (s === 'timeout') {
    return { color: tokens.colors.warning, bg: tokens.colors.warningSubtle };
  }
  return { color: tokens.colors.text.secondary, bg: 'rgba(146, 155, 172, 0.1)' };
}

function formatEventTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

export const EventTimelineItem: React.FC<EventTimelineItemProps> = ({
  event,
  expanded: controlledExpanded,
  onToggleExpand,
}) => {
  const [internalExpanded, setInternalExpanded] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const toggle = onToggleExpand || (() => setInternalExpanded((prev) => !prev));

  const catStyle = getCategoryColor(event.category);
  const statusStyle = getStatusStyle(event.status);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(event.payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box
      sx={{
        borderRadius: `${tokens.borderRadius.sm}px`,
        backgroundColor: tokens.colors.surfaceElevated,
        border: `1px solid ${isExpanded ? tokens.colors.borderActive : tokens.colors.borderSubtle}`,
        transition: 'border-color 0.15s ease',
        overflow: 'hidden',
      }}
    >
      {/* Row Header */}
      <Box
        onClick={toggle}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          p: 1.25,
          cursor: 'pointer',
          userSelect: 'none',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
          },
        }}
      >
        <IconButton size="small" sx={{ p: 0.25, color: tokens.colors.text.muted }}>
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </IconButton>

        {/* Sequence Badge */}
        <Typography
          sx={{
            fontFamily: tokens.typography.fontFamily.mono,
            fontSize: '0.6875rem',
            color: tokens.colors.text.muted,
            minWidth: 32,
          }}
        >
          #{event.sequenceNumber}
        </Typography>

        {/* Timestamp */}
        <Typography
          sx={{
            fontFamily: tokens.typography.fontFamily.mono,
            fontSize: '0.75rem',
            color: tokens.colors.text.secondary,
            minWidth: 64,
          }}
        >
          {formatEventTime(event.timestamp)}
        </Typography>

        {/* Category Chip */}
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1,
            py: 0.25,
            borderRadius: '4px',
            backgroundColor: catStyle.bg,
            border: `1px solid ${catStyle.border}`,
            color: catStyle.text,
            fontSize: '0.6875rem',
            fontWeight: 600,
            fontFamily: tokens.typography.fontFamily.mono,
            textTransform: 'uppercase',
          }}
        >
          {getCategoryIcon(event.category)}
          <span>{event.eventType}</span>
        </Box>

        {/* Tool Name Pill if present */}
        {event.toolName && (
          <Box
            sx={{
              px: 0.75,
              py: 0.2,
              borderRadius: '4px',
              backgroundColor: 'rgba(124, 140, 255, 0.15)',
              color: tokens.colors.primary,
              fontSize: '0.6875rem',
              fontFamily: tokens.typography.fontFamily.mono,
              fontWeight: 600,
            }}
          >
            {event.toolName}
          </Box>
        )}

        {/* Status Chip if present */}
        {statusStyle && event.status && (
          <Box
            sx={{
              px: 0.75,
              py: 0.2,
              borderRadius: '4px',
              backgroundColor: statusStyle.bg,
              color: statusStyle.color,
              fontSize: '0.6875rem',
              fontWeight: 600,
              fontFamily: tokens.typography.fontFamily.mono,
              textTransform: 'uppercase',
            }}
          >
            {event.status}
          </Box>
        )}

        {/* Duration if present */}
        {event.durationSeconds !== undefined && (
          <Typography
            sx={{
              fontFamily: tokens.typography.fontFamily.mono,
              fontSize: '0.6875rem',
              color: tokens.colors.text.muted,
            }}
          >
            {event.durationSeconds}s
          </Typography>
        )}

        {/* Summary */}
        <Typography
          sx={{
            fontSize: '0.8125rem',
            color: tokens.colors.text.primary,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {event.summary}
        </Typography>

        {/* Replay indicator */}
        {event.isReplayed && (
          <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, fontStyle: 'italic' }}>
            replayed
          </Typography>
        )}
      </Box>

      {/* Expanded Payload Content */}
      <Collapse in={isExpanded}>
        <Box
          sx={{
            p: 1.5,
            borderTop: `1px solid ${tokens.colors.borderSubtle}`,
            backgroundColor: tokens.colors.surfaceSubtle,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: tokens.colors.text.muted,
                fontFamily: tokens.typography.fontFamily.mono,
                textTransform: 'uppercase',
              }}
            >
              Payload & Event Details
            </Typography>
            <Button
              size="small"
              onClick={handleCopy}
              startIcon={copied ? <Check size={12} /> : <Copy size={12} />}
              sx={{
                fontSize: '0.6875rem',
                textTransform: 'none',
                py: 0.25,
                px: 1,
                color: tokens.colors.text.secondary,
                borderColor: tokens.colors.borderSubtle,
              }}
            >
              {copied ? 'Copied' : 'Copy JSON'}
            </Button>
          </Box>

          <Box
            component="pre"
            sx={{
              m: 0,
              p: 1.5,
              borderRadius: `${tokens.borderRadius.xs}px`,
              backgroundColor: tokens.colors.backgroundRoot,
              border: `1px solid ${tokens.colors.borderSubtle}`,
              color: tokens.colors.text.primary,
              fontFamily: tokens.typography.fontFamily.mono,
              fontSize: '0.75rem',
              lineHeight: 1.5,
              maxHeight: 260,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {JSON.stringify(event.payload, null, 2)}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
};
