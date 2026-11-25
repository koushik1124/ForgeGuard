import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Filter,
  Pause,
  Play,
  RotateCw,
  Terminal,
} from 'lucide-react';
import { Panel } from '../common/Panel';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { EventTimelineItem } from './EventTimelineItem';
import { ToolCallVisualization } from './ToolCallVisualization';
import { useTaskEvents, UseTaskEventsResult } from '../../api/sse/useTaskEvents';
import { EventFilterCategory } from '../../api/sse/types';
import { tokens } from '../../theme/tokens';

interface LiveExecutionInspectorProps {
  taskId: string;
  isTaskTerminal?: boolean;
  eventsResult?: UseTaskEventsResult;
}

export const LiveExecutionInspector: React.FC<LiveExecutionInspectorProps> = ({
  taskId,
  isTaskTerminal = false,
  eventsResult,
}) => {
  const [viewMode, setViewMode] = useState<'timeline' | 'tools'>('timeline');
  const [allExpanded, setAllExpanded] = useState<boolean>(false);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);

  const internalEvents = useTaskEvents(taskId, {
    enabled: !eventsResult && Boolean(taskId),
    isTaskTerminal,
  });

  const {
    events,
    displayedEvents,
    toolCalls,
    connectionStatus,
    error,
    sequenceGaps,
    hasGaps,
    isPaused,
    autoScroll,
    filter,
    pendingEventCount,
    reconnect,
    togglePause,
    toggleAutoScroll,
    setFilter,
  } = eventsResult || internalEvents;

  // Auto-scroll to bottom of timeline when new events arrive
  useEffect(() => {
    if (autoScroll && !isPaused && timelineScrollRef.current) {
      timelineScrollRef.current.scrollTop = timelineScrollRef.current.scrollHeight;
    }
  }, [displayedEvents.length, autoScroll, isPaused]);

  const scrollToLatest = () => {
    if (timelineScrollRef.current) {
      timelineScrollRef.current.scrollTop = timelineScrollRef.current.scrollHeight;
    }
  };

  const handleToggleExpandAll = () => {
    setAllExpanded((prev) => !prev);
  };

  return (
    <Panel sx={{ p: 2.5 }}>
      {/* Top Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
          mb: 2,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Activity size={18} color={tokens.colors.accentPrimary} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: tokens.colors.text.primary }}>
            Live Execution Inspector
          </Typography>

          <ConnectionStatusBadge status={connectionStatus} />

          <Chip
            label={`${events.length} events`}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.6875rem',
              fontFamily: tokens.typography.fontFamily.mono,
              backgroundColor: tokens.colors.surfaceElevated,
              color: tokens.colors.text.secondary,
            }}
          />

          {toolCalls.length > 0 && (
            <Chip
              label={`${toolCalls.length} tools`}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.6875rem',
                fontFamily: tokens.typography.fontFamily.mono,
                backgroundColor: tokens.colors.surfaceElevated,
                color: tokens.colors.primary,
              }}
            />
          )}
        </Stack>

        {/* View Switcher & Actions */}
        <Stack direction="row" spacing={1} alignItems="center">
          <ButtonGroup size="small" variant="outlined">
            <Button
              onClick={() => setViewMode('timeline')}
              startIcon={<Activity size={13} />}
              sx={{
                fontSize: '0.75rem',
                textTransform: 'none',
                borderColor: tokens.colors.borderSubtle,
                backgroundColor: viewMode === 'timeline' ? tokens.colors.surfaceElevated : 'transparent',
                color: viewMode === 'timeline' ? tokens.colors.accentPrimary : tokens.colors.text.secondary,
              }}
            >
              Timeline
            </Button>
            <Button
              onClick={() => setViewMode('tools')}
              startIcon={<Terminal size={13} />}
              sx={{
                fontSize: '0.75rem',
                textTransform: 'none',
                borderColor: tokens.colors.borderSubtle,
                backgroundColor: viewMode === 'tools' ? tokens.colors.surfaceElevated : 'transparent',
                color: viewMode === 'tools' ? tokens.colors.accentPrimary : tokens.colors.text.secondary,
              }}
            >
              Tool Calls ({toolCalls.length})
            </Button>
          </ButtonGroup>

          {(connectionStatus === 'disconnected' ||
            connectionStatus === 'reconnecting' ||
            connectionStatus === 'polling') && (
            <Tooltip title="Manual Reconnect" arrow>
              <Button
                variant="outlined"
                size="small"
                onClick={reconnect}
                startIcon={<RotateCw size={13} />}
                sx={{
                  fontSize: '0.75rem',
                  textTransform: 'none',
                  borderColor: tokens.colors.borderSubtle,
                  color: tokens.colors.text.primary,
                }}
              >
                Reconnect
              </Button>
            </Tooltip>
          )}
        </Stack>
      </Box>

      {/* Sequence Gap Warning Banner */}
      {hasGaps && (
        <Alert
          severity="warning"
          icon={<AlertTriangle size={16} />}
          sx={{
            mb: 2,
            backgroundColor: tokens.colors.warningSubtle,
            border: `1px solid rgba(240, 180, 90, 0.4)`,
            color: tokens.colors.text.primary,
            fontSize: '0.8125rem',
          }}
        >
          Sequence gap detected in event stream: missing events from seq{' '}
          {sequenceGaps.map((g) => `${g.from}..${g.to}`).join(', ')}. Historical event timeline may be incomplete.
        </Alert>
      )}

      {/* Error Notice */}
      {error && connectionStatus !== 'connected' && connectionStatus !== 'closed' && (
        <Alert
          severity="info"
          sx={{
            mb: 2,
            backgroundColor: 'rgba(89, 176, 246, 0.1)',
            border: `1px solid rgba(89, 176, 246, 0.3)`,
            color: tokens.colors.text.primary,
            fontSize: '0.8125rem',
          }}
        >
          {connectionStatus === 'polling'
            ? 'SSE streaming disconnected. Operating in automatic polling fallback mode.'
            : `Stream connection notice: ${error.message}`}
        </Alert>
      )}

      {/* Paused Mode Banner */}
      {isPaused && (
        <Alert
          severity="warning"
          icon={<Pause size={16} />}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={togglePause}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Catch Up Now
            </Button>
          }
          sx={{
            mb: 2,
            backgroundColor: tokens.colors.warningSubtle,
            border: `1px solid rgba(240, 180, 90, 0.4)`,
            color: tokens.colors.text.primary,
            fontSize: '0.8125rem',
          }}
        >
          Live timeline viewing paused.{' '}
          {pendingEventCount > 0 ? `${pendingEventCount} new event(s) received in background.` : 'Reviewing historical events.'}
        </Alert>
      )}

      {/* Timeline Controls Toolbar */}
      {viewMode === 'timeline' && (
        <Box
          sx={{
            p: 1.25,
            mb: 2,
            borderRadius: `${tokens.borderRadius.sm}px`,
            backgroundColor: tokens.colors.surfaceSubtle,
            border: `1px solid ${tokens.colors.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1.5,
          }}
        >
          {/* Filter & Expand */}
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Filter size={14} color={tokens.colors.text.muted} />
              <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, fontWeight: 600 }}>
                FILTER:
              </Typography>
            </Box>

            <Select
              size="small"
              value={filter}
              onChange={(e) => setFilter(e.target.value as EventFilterCategory)}
              sx={{
                fontSize: '0.75rem',
                height: 28,
                backgroundColor: tokens.colors.surfaceElevated,
                color: tokens.colors.text.primary,
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: tokens.colors.borderSubtle,
                },
              }}
            >
              <MenuItem value="all" sx={{ fontSize: '0.75rem' }}>All Events ({events.length})</MenuItem>
              <MenuItem value="tool" sx={{ fontSize: '0.75rem' }}>Tool Calls</MenuItem>
              <MenuItem value="policy" sx={{ fontSize: '0.75rem' }}>Policy Decisions</MenuItem>
              <MenuItem value="budget" sx={{ fontSize: '0.75rem' }}>Budget Events</MenuItem>
              <MenuItem value="lifecycle" sx={{ fontSize: '0.75rem' }}>Task Lifecycle</MenuItem>
              <MenuItem value="error" sx={{ fontSize: '0.75rem' }}>Failures & Errors</MenuItem>
            </Select>

            <Button
              size="small"
              variant="text"
              onClick={handleToggleExpandAll}
              startIcon={allExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              sx={{
                fontSize: '0.75rem',
                textTransform: 'none',
                color: tokens.colors.text.secondary,
              }}
            >
              {allExpanded ? 'Collapse All' : 'Expand All'}
            </Button>
          </Stack>

          {/* Streaming & Auto-scroll Controls */}
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title={isPaused ? 'Resume live timeline viewing' : 'Pause timeline view to inspect without scrolling'} arrow>
              <Button
                size="small"
                variant="outlined"
                onClick={togglePause}
                startIcon={isPaused ? <Play size={13} /> : <Pause size={13} />}
                sx={{
                  fontSize: '0.75rem',
                  textTransform: 'none',
                  borderColor: isPaused ? tokens.colors.warning : tokens.colors.borderSubtle,
                  color: isPaused ? tokens.colors.warning : tokens.colors.text.primary,
                }}
              >
                {isPaused ? 'Resume Live' : 'Pause'}
              </Button>
            </Tooltip>

            <Tooltip title="Toggle automatic scrolling to latest event" arrow>
              <Button
                size="small"
                variant="outlined"
                onClick={toggleAutoScroll}
                sx={{
                  fontSize: '0.75rem',
                  textTransform: 'none',
                  borderColor: autoScroll ? tokens.colors.borderActive : tokens.colors.borderSubtle,
                  color: autoScroll ? tokens.colors.accentPrimary : tokens.colors.text.muted,
                  backgroundColor: autoScroll ? tokens.colors.primarySubtle : 'transparent',
                }}
              >
                Auto-scroll {autoScroll ? 'ON' : 'OFF'}
              </Button>
            </Tooltip>

            <Tooltip title="Scroll to latest event" arrow>
              <IconButton
                size="small"
                onClick={scrollToLatest}
                sx={{
                  border: `1px solid ${tokens.colors.borderSubtle}`,
                  borderRadius: '4px',
                  color: tokens.colors.text.secondary,
                }}
              >
                <ArrowDown size={13} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      )}

      {/* Main View Area */}
      {viewMode === 'tools' ? (
        <ToolCallVisualization toolCalls={toolCalls} />
      ) : (
        <Box
          ref={timelineScrollRef}
          sx={{
            maxHeight: 520,
            overflowY: 'auto',
            pr: 0.5,
          }}
        >
          {displayedEvents.length === 0 ? (
            <Box
              sx={{
                p: 4,
                textAlign: 'center',
                borderRadius: `${tokens.borderRadius.sm}px`,
                backgroundColor: tokens.colors.surfaceSubtle,
                border: `1px solid ${tokens.colors.borderSubtle}`,
              }}
            >
              <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.text.secondary }}>
                {filter !== 'all'
                  ? `No events matching filter '${filter}'.`
                  : connectionStatus === 'connecting'
                  ? 'Connecting to execution event stream...'
                  : 'Awaiting execution events from runtime...'}
              </Typography>
            </Box>
          ) : (
            <Stack spacing={1}>
              {displayedEvents.map((event) => (
                <EventTimelineItem
                  key={event.id}
                  event={event}
                  expanded={allExpanded ? true : undefined}
                />
              ))}
            </Stack>
          )}
        </Box>
      )}
    </Panel>
  );
};
