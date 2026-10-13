export type Field = {
  name: string;
  desc: string;
};

export type CodeBlock = {
  label: string;
  json: string;
};

export type Table = {
  headers: string[];
  rows: string[][];
};

export type TopicBlock = {
  reqTopic?: string;
  rspTopic?: string;
  topic?: string;
  direction?: string;
  qos?: string;
  payload?: CodeBlock;
  request?: CodeBlock;
  response?: CodeBlock | null;
  fields?: Field[];
  possibleValues?: Field[];
  note?: string;
};

export type Section = {
  id: string;
  title: string;
  intro?: string;
  fields?: Field[];
  table?: Table;
  topic?: TopicBlock;
  note?: string;
};

export type Doc = {
  id: string;
  name: string;
  subtitle: string;
  version: string;
  audience: string;
  accent: 'teal' | 'indigo';
  sections: Section[];
};
