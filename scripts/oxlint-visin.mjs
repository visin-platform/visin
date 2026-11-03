/** Preserve the frontend's theme-token rule when migrating from ESLint. */
const color = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$|(?:^|\s)#[0-9a-fA-F]{6}\b|\b(?:rgba?|hsla?)\(/;
const templateColor = /(?:^|\s)#[0-9a-fA-F]{6}\b|\b(?:rgba?|hsla?)\(/;
export default {
  meta: { name: 'visin' },
  rules: {
    'no-color-literals': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          color: 'Colour literal: use a theme palette path, a @visin/frontend-core token, or useChartColors().'
        }
      },
      create(context) {
        return {
          Literal(node) {
            if (typeof node.value === 'string' && color.test(node.value)) context.report({ node, messageId: 'color' });
          },
          TemplateElement(node) {
            if (templateColor.test(node.value.raw)) context.report({ node, messageId: 'color' });
          }
        };
      }
    }
  }
};
