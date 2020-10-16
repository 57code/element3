import { toggleRowStatus, getKeysMap, getRowIdentity } from '../util'
import { reactive } from 'vue'

export function useExpand({ table, scheduleLayout, assertRowKey }) {
  const state = reactive({
    states: {
      defaultExpandAll: false,
      expandRows: []
    }
  })

  function updateExpandRows() {
    const { data = [], rowKey, defaultExpandAll, expandRows } = state.states
    if (defaultExpandAll) {
      state.states.expandRows = data.slice()
    } else if (rowKey) {
      // TODO：这里的代码可以优化
      const expandRowsMap = getKeysMap(expandRows, rowKey)
      state.states.expandRows = data.reduce((prev, row) => {
        const rowId = getRowIdentity(row, rowKey)
        const rowInfo = expandRowsMap[rowId]
        if (rowInfo) {
          prev.push(row)
        }
        return prev
      }, [])
    } else {
      state.states.expandRows = []
    }
  }

  function toggleRowExpansion(row, expanded) {
    const changed = toggleRowStatus(state.states.expandRows, row, expanded)
    if (changed) {
      table.$emit('expand-change', row, state.states.expandRows.slice())
      scheduleLayout()
    }
  }

  function setExpandRowKeys(rowKeys) {
    assertRowKey()
    // TODO：这里的代码可以优化
    const { data, rowKey } = state.states
    const keysMap = getKeysMap(data, rowKey)
    state.states.expandRows = rowKeys.reduce((prev, cur) => {
      const info = keysMap[cur]
      if (info) {
        prev.push(info.row)
      }
      return prev
    }, [])
  }

  function isRowExpanded(row) {
    const { expandRows = [], rowKey } = state.states
    if (rowKey) {
      const expandMap = getKeysMap(expandRows, rowKey)
      return !!expandMap[getRowIdentity(row, rowKey)]
    }
    return expandRows.indexOf(row) !== -1
  }

  return {
    isRowExpanded,
    setExpandRowKeys,
    toggleRowExpansion,
    updateExpandRows,
    expandRows: state.states.expandRows
  }
}
