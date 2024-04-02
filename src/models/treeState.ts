interface TreeState {
  x: number;
  y: number;
  state: string; // Tree state. States 0-3 are the tree growing stages. State 4 is the tree fully grown, ready to be farmed. State 5 means that the tree has been farmed.
}

export default TreeState;
