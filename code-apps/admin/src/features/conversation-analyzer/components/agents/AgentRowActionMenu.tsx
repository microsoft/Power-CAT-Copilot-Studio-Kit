import { Button, Menu, MenuTrigger, MenuPopover, MenuList, MenuItem } from '@fluentui/react-components';
import {
  MoreHorizontal20Regular,
  DataBarVertical20Regular,
  Play20Regular,
  Chat20Regular,
} from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import type { AgentTableRow } from '../../hooks/useAgentsTable';
import { agentResultsPath, originQuery } from '../../utils/resultsOrigin';

/**
 * Single ⋯ menu per agent row: View results (when analyzed) · Run analysis · View conversations.
 */
export function AgentRowActionMenu({ row }: { row: AgentTableRow }) {
  const navigate = useNavigate();
  const agentKey = row.agentId ?? row.agentDetailsId;
  const id = encodeURIComponent(agentKey);

  const viewConversations = () => {
    const params = new URLSearchParams({ tab: 'conversations' });
    if (row.environmentUrl) params.set('env', row.environmentUrl);
    if (row.agentId) params.set('agent', row.agentId);
    navigate(`/conversation-analyzer?${params.toString()}`);
  };

  return (
    <Menu positioning="below-end">
      <MenuTrigger disableButtonEnhancement>
        <Button
          appearance="subtle"
          size="small"
          icon={<MoreHorizontal20Regular />}
          aria-label={`More actions for ${row.name}`}
        />
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {row.hasResults && (
            <MenuItem
              icon={<DataBarVertical20Regular />}
              onClick={() => navigate(agentResultsPath(agentKey, { environmentUrl: row.environmentUrl }))}
            >
              View results
            </MenuItem>
          )}
          <MenuItem
            icon={<Play20Regular />}
            onClick={() => navigate(`/conversation-analyzer/agents/${id}/new-analysis${originQuery(undefined, row.environmentUrl)}`)}
          >
            Run analysis
          </MenuItem>
          <MenuItem icon={<Chat20Regular />} onClick={viewConversations}>
            View conversations
          </MenuItem>
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}
