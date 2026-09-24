import { useRef } from 'react';
import { Box } from '@mui/material';
import { useConfig } from '../../config/ConfigProvider';
import CopyButton from './CopyButton';
import { codeFrameSx, codeHeaderSx, codePreSx } from './codeFrame';

/** Where a local `docker compose up` serves MCP, for a page that has not been told its own. */
const LOCAL_MCP = 'http://localhost:5009';

/** This deployment's MCP address, from the page's config, ready to copy. */
export default function McpEndpoint() {
  const configured = useConfig().MCP_PUBLIC_URL;
  const endpoint = `${(configured || LOCAL_MCP).replace(/\/$/, '')}/mcp`;
  const ref = useRef<HTMLPreElement>(null);

  return (
    <Box sx={codeFrameSx}>
      <Box sx={codeHeaderSx}>
        <span>{configured ? 'This deployment' : 'A local Visin'}</span>
        <CopyButton target={ref} />
      </Box>
      <Box component="pre" ref={ref} tabIndex={0} sx={codePreSx}>
        {endpoint}
      </Box>
    </Box>
  );
}
