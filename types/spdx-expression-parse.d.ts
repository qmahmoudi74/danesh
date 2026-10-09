declare module 'spdx-expression-parse' {
  export type Expression = { license: string; plus?: boolean; exception?: string }
    | { conjunction: 'and' | 'or'; left: Expression; right: Expression };
  export default function parse(expression: string): Expression;
}
