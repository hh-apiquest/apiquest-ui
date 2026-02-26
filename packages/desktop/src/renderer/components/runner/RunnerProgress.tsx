import React from 'react';
import { Box, Flex, Text, Progress } from '@radix-ui/themes';
import { CheckCircleIcon, XCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import type { Tab } from '../../contexts/TabContext';
import type { RunnerMetadata } from '../../contexts/TabContext';

interface RunnerProgressProps {
  tab: Tab;
}

export function RunnerProgress({ tab }: RunnerProgressProps) {
  const metadata = tab.metadata as RunnerMetadata;
  
  // Parse execution events to get progress
  const events = tab.execution?.events || [];
  const totalRequests = metadata.selectedRequests.length;
  
  // Track completed requests - use Set to deduplicate by requestId
  const completedRequestIds = new Set<string>();
  const passedRequestIds = new Set<string>();
  const failedRequestIds = new Set<string>();
  
  events.forEach(event => {
    if (event.type === 'requestCompleted' && event.data?.requestId) {
      completedRequestIds.add(event.data.requestId);
      if (event.data.success === true) {
        passedRequestIds.add(event.data.requestId);
      } else if (event.data.success === false) {
        failedRequestIds.add(event.data.requestId);
      }
    }
  });
  
  const completedRequests = completedRequestIds.size;
  const passedRequests = passedRequestIds.size;
  const failedRequests = failedRequestIds.size;
  
  // Calculate duration
  const startTime = events.find(e => e.type === 'beforeRun')?.timestamp;
  const endTime = events.length > 0 ? events[events.length - 1].timestamp : undefined;
  const duration = startTime && endTime ? Math.round((endTime - startTime) / 1000) : 0;
  
  // Calculate progress percentage, capped at 100
  const progress = totalRequests > 0 ? Math.min((completedRequests / totalRequests) * 100, 100) : 0;
  
  // Map request IDs to their status
  const requestStatuses = new Map<string, 'pending' | 'running' | 'completed' | 'failed'>();
  metadata.selectedRequests.forEach(id => requestStatuses.set(id, 'pending'));
  
  events.forEach(event => {
    if (event.type === 'requestStarted' && event.data?.requestId) {
      if (requestStatuses.get(event.data.requestId) === 'pending') {
        requestStatuses.set(event.data.requestId, 'running');
      }
    } else if (event.type === 'requestCompleted' && event.data?.requestId) {
      const success = event.data.success === true;
      requestStatuses.set(event.data.requestId, success ? 'completed' : 'failed');
    }
  });

  return (
    <Box p="4">
      <Flex direction="column" gap="4">
        {/* Overall Progress */}
        <Box>
          <Flex align="center" justify="between" mb="2">
            <Text size="2" weight="medium">Progress</Text>
            <Text size="1" color="gray">
              {completedRequests} / {totalRequests} requests
            </Text>
          </Flex>
          <Progress value={progress} size="3" color={failedRequests > 0 ? 'red' : 'blue'} />
        </Box>

        {/* Request List with Status */}
        <Box>
          <Text size="2" weight="medium" mb="2">Requests</Text>
          <Flex direction="column" gap="2">
            {metadata.selectedRequests.map((requestId, index) => {
              const status = requestStatuses.get(requestId) || 'pending';
              const icon = status === 'completed' ? (
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
              ) : status === 'failed' ? (
                <XCircleIcon className="w-4 h-4 text-red-500" />
              ) : status === 'running' ? (
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              ) : (
                <ClockIcon className="w-4 h-4 text-gray-400" />
              );
              
              return (
                <Box
                  key={requestId}
                  p="2"
                  style={{
                    borderRadius: '4px',
                    border: '1px solid var(--gray-6)',
                    background: 'var(--gray-2)'
                  }}
                >
                  <Flex align="center" gap="2">
                    {icon}
                    <Text size="2">Request {index + 1}</Text>
                    <Text size="1" color="gray" style={{ marginLeft: 'auto', textTransform: 'capitalize' }}>
                      {status}
                    </Text>
                  </Flex>
                </Box>
              );
            })}
          </Flex>
        </Box>

        {/* Summary Stats */}
        <Flex gap="4">
          <Box 
            p="3" 
            style={{ 
              flex: 1, 
              borderRadius: '4px', 
              border: '1px solid var(--gray-6)',
              background: 'var(--gray-2)'
            }}
          >
            <Flex direction="column" align="center" gap="1">
              <CheckCircleIcon className="w-5 h-5 text-green-500" />
              <Text size="2" weight="medium">{passedRequests}</Text>
              <Text size="1" color="gray">Passed</Text>
            </Flex>
          </Box>
          
          <Box 
            p="3" 
            style={{ 
              flex: 1, 
              borderRadius: '4px', 
              border: '1px solid var(--gray-6)',
              background: 'var(--gray-2)'
            }}
          >
            <Flex direction="column" align="center" gap="1">
              <XCircleIcon className="w-5 h-5 text-red-500" />
              <Text size="2" weight="medium">{failedRequests}</Text>
              <Text size="1" color="gray">Failed</Text>
            </Flex>
          </Box>
          
          <Box 
            p="3" 
            style={{ 
              flex: 1, 
              borderRadius: '4px', 
              border: '1px solid var(--gray-6)',
              background: 'var(--gray-2)'
            }}
          >
            <Flex direction="column" align="center" gap="1">
              <ClockIcon className="w-5 h-5 text-gray-500" />
              <Text size="2" weight="medium">{duration}s</Text>
              <Text size="1" color="gray">Duration</Text>
            </Flex>
          </Box>
        </Flex>
      </Flex>
    </Box>
  );
}
