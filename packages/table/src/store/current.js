import { arrayFind } from 'element-ui/src/utils/util'
import { getRowIdentity } from '../util'
import { reactive } from 'vue'

export function useCurrent({ table, assertRowKey }) {
  const state = reactive({
    states: {
      // 不可响应的，设置 currentRowKey 时，data 不一定存在，也许无法算出正确的 currentRow
      // 把该值缓存一下，当用户点击修改 currentRow 时，把该值重置为 null
      _currentRowKey: null,
      currentRow: null
    }
  })

  function setCurrentRowKey(key) {
    assertRowKey()
    state.states._currentRowKey = key
    setCurrentRowByKey(key)
  }

  function restoreCurrentRowKey() {
    state.states._currentRowKey = null
  }

  function setCurrentRowByKey(key) {
    const states = state.state
    const { data = [], rowKey } = states
    let currentRow = null
    if (rowKey) {
      currentRow = arrayFind(
        data,
        (item) => getRowIdentity(item, rowKey) === key
      )
    }
    states.currentRow = currentRow
  }

  function updateCurrentRow(currentRow) {
    const { states } = state
    const oldCurrentRow = states.currentRow
    if (currentRow && currentRow !== oldCurrentRow) {
      states.currentRow = currentRow
      table.$emit('current-change', currentRow, oldCurrentRow)
      return
    }
    if (!currentRow && oldCurrentRow) {
      states.currentRow = null
      table.$emit('current-change', null, oldCurrentRow)
    }
  }

  function updateCurrentRowData() {
    const { states } = state
    const { rowKey, _currentRowKey } = states
    // data 为 null 时，解构时的默认值会被忽略
    const data = states.data || []
    const oldCurrentRow = states.currentRow

    // 当 currentRow 不在 data 中时尝试更新数据
    if (data.indexOf(oldCurrentRow) === -1 && oldCurrentRow) {
      if (rowKey) {
        const currentRowKey = getRowIdentity(oldCurrentRow, rowKey)
        setCurrentRowByKey(currentRowKey)
      } else {
        states.currentRow = null
      }
      if (states.currentRow === null) {
        table.$emit('current-change', null, oldCurrentRow)
      }
    } else if (_currentRowKey) {
      // 把初始时下设置的 rowKey 转化成 rowData
      setCurrentRowByKey(_currentRowKey)
      restoreCurrentRowKey()
    }
  }

  return { setCurrentRowKey, updateCurrentRow, updateCurrentRowData }
}
