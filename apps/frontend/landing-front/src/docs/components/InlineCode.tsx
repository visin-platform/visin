import { useContext, type ComponentProps } from 'react';
import { Box } from '@mui/material';
import { InCodeBlockContext } from '../codeLanguage';
import { MONO } from '../../theme';

/** `code` in a sentence. Inside a fenced block it is left as Shiki made it. */
export default function InlineCode(props: ComponentProps<'code'>) {
  const inBlock = useContext(InCodeBlockContext);
  if (inBlock) return <code {...props} />;

  return (
    <Box
      component="code"
      sx={{
        px: 0.6,
        py: 0.15,
        borderRadius: '6px',
        bgcolor: 'grey.100',
        border: '1px solid',
        borderColor: 'grey.200',
        fontFamily: MONO,
        fontSize: '0.86em',
        overflowWrap: 'anywhere'
      }}
      {...props}
    />
  );
}
