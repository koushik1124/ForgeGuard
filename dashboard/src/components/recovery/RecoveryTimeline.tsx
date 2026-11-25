import React, { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  AlertOctagon,
  AlertTriangle,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Play,
  RotateCw,
  Search,
  XCircle,
} from 'lucide-react';
import { tokens } from '../../theme/tokens';
import { TimelineEntryItem } from '../../api/recovery/types';

export interface RecoveryTimelineProps {
  entries: TimelineEntryItem[];
}

export const RecoveryTimeline: React.FC<RecoveryTimelineProps> = ({ entries }) => {
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedSeq, setExpandedSeq] = useState<number | null>(null);

  const toggleExpand = (seq: number) => {
    setExpandedSeq((prev) => (prev === seq ? null : seq));
  };

  const categories = Array.from(new Set(entries.map((e) => e.category)));

  const filteredEntries = entries.filter((entry) => {
    if (filterCategory !== 'all' && entry.category !== filterCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const inType = entry.event_type.toLowerCase().includes(q);
      const inSummary = entry.summary.toLowerCase().includes(q);
      const inTool = (entry.tool_name || '').toLowerCase().includes(q);
      const inCat = entry.category.toLowerCase().includes(q);
      return inType || inSummary || inTool || inCat;
    }
    return true;
  });

  const getEventHighlight = (eventType: string, status: string) => {
    if (eventType === 'task_resumed') {
      return {
        borderColor: 'rgba(53, 201, 138, 0.5)',
        bgColor: 'rgba(53, 201, 138, 0.08)',
        icon: <Play size={16} color={tokens.colors.success} />,
        accentColor: tokens.colors.success,
      };
    }
    if (eventType === 'tool_timeout') {
      return {
        borderColor: 'rgba(240, 180, 90, 0.5)',
        bgColor: 'rgba(240, 180, 90, 0.08)',
        icon: <Clock size={16} color={tokens.colors.warning} />,
        accentColor: tokens.colors.warning,
      };
    }
    if (eventType === 'budget_exceeded' || eventType === 'task_failed' || status === 'failure') {
      return {
        borderColor: 'rgba(241, 108, 120, 0.5)',
        bgColor: 'rgba(241, 108, 120, 0.08)',
        icon: <AlertOctagon size={16} color={tokens.colors.error} />,
        accentColor: tokens.colors.error,
      };
    }
    if (eventType === 'tool_call_rejected') {
      return {
        borderColor: 'rgba(240, 180, 90, 0.4)',
        bgColor: 'rgba(240, 180, 90, 0.06)',
        icon: <AlertTriangle size={16} color={tokens.colors.warning} />,
        accentColor: tokens.colors.warning,
      };
    }
    if (eventType === 'task_completed') {
      return {
        borderColor: 'rgba(53, 201, 138, 0.3)',
        bgColor: tokens.colors.surfaceElevated,
        icon: <CheckCircle size={16} color={tokens.colors.success} />,
        accentColor: tokens.colors.success,
      };
    }
    if (eventType === 'task_cancelled') {
      return {
        borderColor: tokens.colors.borderSubtle,
        bgColor: tokens.colors.surfaceElevated,
        icon: <XCircle size={16} color={tokens.colors.text.muted} />,
        accentColor: tokens.colors.text.muted,
      };
    }

    return {
      borderColor: tokens.colors.borderSubtle,
      bgColor: tokens.colors.surfaceElevated,
      icon: <RotateCw size={16} color={tokens.colors.accentPrimary} />,
      accentColor: tokens.colors.text.secondary,
    };
  };

  return (
    <Box>
      {/* Top Filter and Search Controls */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          mb: 2,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Button
            size="small"
            variant={filterCategory === 'all' ? 'contained' : 'outlined'}
            onClick={() => setFilterCategory('all')}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              borderRadius: `${tokens.borderRadius.sm}px`,
              borderColor: tokens.colors.borderSubtle,
              backgroundColor: filterCategory === 'all' ? tokens.colors.primarySubtle : 'transparent',
              color: filterCategory === 'all' ? tokens.colors.accentPrimary : tokens.colors.text.secondary,
            }}
          >
            All Events ({entries.length})
          </Button>

          {categories.map((cat) => {
            const count = entries.filter((e) => e.category === cat).length;
            const active = filterCategory === cat;
            return (
              <Button
                key={cat}
                size="small"
                variant={active ? 'contained' : 'outlined'}
                onClick={() => setFilterCategory(cat)}
                sx={{
                  fontSize: '0.75rem',
                  textTransform: 'none',
                  borderRadius: `${tokens.borderRadius.sm}px`,
                  borderColor: tokens.colors.borderSubtle,
                  backgroundColor: active ? tokens.colors.surfaceElevated : 'transparent',
                  color: active ? tokens.colors.text.primary : tokens.colors.text.secondary,
                }}
              >
                {cat.toUpperCase()} ({count})
              </Button>
            );
          })}
        </Stack>

        <TextField
          size="small"
          placeholder="Filter timeline..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={14} color={tokens.colors.text.muted} />
              </InputAdornment>
            ),
          }}
          sx={{
            width: { xs: '100%', sm: 220 },
            '& .MuiInputBase-root': {
              fontSize: '0.75rem',
              height: 32,
              backgroundColor: tokens.colors.surfaceElevated,
              borderColor: tokens.colors.borderSubtle,
            },
          }}
        />
      </Box>

      {/* Timeline Entries List */}
      {entries.length === 0 ? (
        <Box
          sx={{
            p: 4,
            textAlign: 'center',
            backgroundColor: tokens.colors.surfaceElevated,
            borderRadius: `${tokens.borderRadius.sm}px`,
            border: `1px dashed ${tokens.colors.borderSubtle}`,
          }}
        >
          <Calendar size={32} color={tokens.colors.text.disabled} style={{ marginBottom: 8 }} />
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: tokens.colors.text.secondary }}>
            No Timeline Entries Recorded
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, mt: 0.5 }}>
            No lifecycle or execution journal events have been emitted for this task.
          </Typography>
        </Box>
      ) : filteredEntries.length === 0 ? (
        <Box
          sx={{
            p: 3,
            textAlign: 'center',
            backgroundColor: tokens.colors.surfaceElevated,
            borderRadius: `${tokens.borderRadius.sm}px`,
            border: `1px solid ${tokens.colors.borderSubtle}`,
          }}
        >
          <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.text.secondary }}>
            No timeline events match the selected category or search filter.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1}>
          {filteredEntries.map((item) => {
            const isExpanded = expandedSeq === item.sequence_number;
            const highlight = getEventHighlight(item.event_type, item.status);

            return (
              <Box
                key={item.sequence_number}
                sx={{
                  borderRadius: `${tokens.borderRadius.sm}px`,
                  backgroundColor: highlight.bgColor,
                  border: `1px solid ${highlight.borderColor}`,
                  overflow: 'hidden',
                  transition: 'border-color 0.2s',
                  '&:hover': {
                    borderColor: tokens.colors.borderHover,
                  },
                }}
              >
                <Box
                  sx={{
                    p: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 1.5,
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleExpand(item.sequence_number)}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <Box
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: `${tokens.borderRadius.sm}px`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(146, 155, 172, 0.08)',
                      }}
                    >
                      {highlight.icon}
                    </Box>

                    {/* Sequence Badge */}
                    <Typography
                      sx={{
                        fontSize: '0.75rem',
                        fontFamily: tokens.typography.fontFamily.mono,
                        fontWeight: 700,
                        color: tokens.colors.accentPrimary,
                        minWidth: 32,
                      }}
                    >
                      #{item.sequence_number}
                    </Typography>

                    {/* Event Type & Category */}
                    <Chip
                      label={item.event_type}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.6875rem',
                        fontFamily: tokens.typography.fontFamily.mono,
                        fontWeight: 600,
                        backgroundColor: 'rgba(146, 155, 172, 0.12)',
                        color: tokens.colors.text.primary,
                        borderRadius: '4px',
                      }}
                    />

                    <Chip
                      label={item.category.toUpperCase()}
                      size="small"
                      variant="outlined"
                      sx={{
                        height: 20,
                        fontSize: '0.625rem',
                        borderColor: tokens.colors.borderSubtle,
                        color: tokens.colors.text.muted,
                        borderRadius: '4px',
                      }}
                    />

                    {/* Summary */}
                    <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.text.primary }}>
                      {item.summary}
                    </Typography>
                  </Box>

                  {/* Right: Timestamp and Toggle */}
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography
                      sx={{
                        fontSize: '0.6875rem',
                        fontFamily: tokens.typography.fontFamily.mono,
                        color: tokens.colors.text.muted,
                      }}
                    >
                      {new Date(item.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </Typography>

                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(item.sequence_number);
                      }}
                      sx={{ color: tokens.colors.text.muted }}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </IconButton>
                  </Stack>
                </Box>

                {/* Expandable Metadata */}
                <Collapse in={isExpanded} unmountOnExit>
                  <Box
                    sx={{
                      p: 2,
                      backgroundColor: tokens.colors.surfaceSubtle,
                      borderTop: `1px solid ${tokens.colors.borderSubtle}`,
                    }}
                  >
                    <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: tokens.colors.text.muted, mb: 1, textTransform: 'uppercase' }}>
                      Event Metadata & Arguments
                    </Typography>
                    {item.metadata && Object.keys(item.metadata).length > 0 ? (
                      <Box
                        component="pre"
                        sx={{
                          p: 1.5,
                          borderRadius: `${tokens.borderRadius.sm}px`,
                          backgroundColor: tokens.colors.surfaceElevated,
                          border: `1px solid ${tokens.colors.borderSubtle}`,
                          fontSize: '0.75rem',
                          fontFamily: tokens.typography.fontFamily.mono,
                          color: tokens.colors.text.secondary,
                          overflowX: 'auto',
                          m: 0,
                        }}
                      >
                        {JSON.stringify(item.metadata, null, 2)}
                      </Box>
                    ) : (
                      <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted }}>
                        No metadata attached to event.
                      </Typography>
                    )}
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );
};
