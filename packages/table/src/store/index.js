import merge from 'element-ui/src/utils/merge'
import { arrayFind } from 'element-ui/src/utils/util'
import {
  getKeysMap,
  getRowIdentity,
  getColumnById,
  getColumnByKey,
  orderBy,
  toggleRowStatus
} from '../util'
import { useExpand } from './expand'
import { useCurrent } from './current'
import { useTree } from './tree'
import { reactive, nextTick } from 'vue'

const sortData = (data, states) => {
  const sortingColumn = states.sortingColumn
  if (!sortingColumn || typeof sortingColumn.sortable === 'string') {
    return data
  }
  return orderBy(
    data,
    states.sortProp,
    states.sortOrder,
    sortingColumn.sortMethod,
    sortingColumn.sortBy
  )
}

const doFlattenColumns = (columns) => {
  const result = []
  columns.forEach((column) => {
    if (column.children) {
      result.push.apply(result, doFlattenColumns(column.children))
    } else {
      result.push(column)
    }
  })
  return result
}

export function useStore(table) {
  const {
    updateTreeExpandKeys,
    toggleTreeExpansion,
    loadOrToggle,
    treeStates
  } = useTree({
    table,
    assertRowKey,
    updateTableScrollY
  })

  const {
    isRowExpanded,
    setExpandRowKeys,
    toggleRowExpansion,
    updateExpandRows,
    expandRows
  } = useExpand({
    table,
    scheduleLayout,
    assertRowKey
  })

  const {
    setCurrentRowKey,
    updateCurrentRow,
    updateCurrentRowData,
    currentStates
  } = useCurrent({
    table,
    assertRowKey
  })

  const state = reactive({
    states: {
      // 3.0 版本后要求必须设置该属性
      rowKey: null,

      // 渲染的数据来源，是对 table 中的 data 过滤排序后的结果
      data: [],

      // 是否包含固定列
      isComplex: false,

      // 列
      _columns: [], // 不可响应的
      originColumns: [],
      columns: [],
      fixedColumns: [],
      rightFixedColumns: [],
      leafColumns: [],
      fixedLeafColumns: [],
      rightFixedLeafColumns: [],
      leafColumnsLength: 0,
      fixedLeafColumnsLength: 0,
      rightFixedLeafColumnsLength: 0,

      // 选择
      isAllSelected: false,
      selection: [],
      reserveSelection: false,
      selectOnIndeterminate: false,
      selectable: null,

      // 过滤
      filters: {}, // 不可响应的
      filteredData: null,

      // 排序
      sortingColumn: null,
      sortProp: null,
      sortOrder: null,

      hoverRow: null,

      // tree data
      lazyTreeNodeMap: treeStates.lazyTreeNodeMap,
      treeData: treeStates.treeData,
      childrenColumnName: treeStates.childrenColumnName,

      // expandRows
      expandRows,

      // current
      currentRow: currentStates.currentRow
    }
  })

  // 检查 rowKey 是否存在
  function assertRowKey() {
    const rowKey = state.states.rowKey
    if (!rowKey) throw new Error('[ElTable] prop row-key is required')
  }

  // 更新 DOM
  function scheduleLayout(needUpdateColumns) {
    if (needUpdateColumns) {
      updateColumns()
    }
    table.debouncedUpdateLayout()
  }

  function updateTableScrollY() {
    nextTick(table.updateScrollY)
  }

  // 更新列
  function updateColumns() {
    const states = state.states
    const _columns = states._columns || []
    states.fixedColumns = _columns.filter(
      (column) => column.fixed === true || column.fixed === 'left'
    )
    states.rightFixedColumns = _columns.filter(
      (column) => column.fixed === 'right'
    )

    if (
      states.fixedColumns.length > 0 &&
      _columns[0] &&
      _columns[0].type === 'selection' &&
      !_columns[0].fixed
    ) {
      _columns[0].fixed = true
      states.fixedColumns.unshift(_columns[0])
    }

    const notFixedColumns = _columns.filter((column) => !column.fixed)
    states.originColumns = []
      .concat(states.fixedColumns)
      .concat(notFixedColumns)
      .concat(states.rightFixedColumns)

    const leafColumns = doFlattenColumns(notFixedColumns)
    const fixedLeafColumns = doFlattenColumns(states.fixedColumns)
    const rightFixedLeafColumns = doFlattenColumns(states.rightFixedColumns)

    states.leafColumnsLength = leafColumns.length
    states.fixedLeafColumnsLength = fixedLeafColumns.length
    states.rightFixedLeafColumnsLength = rightFixedLeafColumns.length

    states.columns = []
      .concat(fixedLeafColumns)
      .concat(leafColumns)
      .concat(rightFixedLeafColumns)
    states.isComplex =
      states.fixedColumns.length > 0 || states.rightFixedColumns.length > 0
  }

  // 选择
  function isSelected(row) {
    const { selection = [] } = state.states
    return selection.indexOf(row) > -1
  }

  function clearSelection() {
    const states = state.states
    states.isAllSelected = false
    const oldSelection = states.selection
    if (oldSelection.length) {
      states.selection = []
      table.$emit('selection-change', [])
    }
  }

  function cleanSelection() {
    const states = state.states
    const { data, rowKey, selection } = states
    let deleted
    if (rowKey) {
      deleted = []
      const selectedMap = getKeysMap(selection, rowKey)
      const dataMap = getKeysMap(data, rowKey)
      for (const key in selectedMap) {
        if (Object.hasOwnProperty.call(selectedMap, key) && !dataMap[key]) {
          deleted.push(selectedMap[key].row)
        }
      }
    } else {
      deleted = selection.filter((item) => data.indexOf(item) === -1)
    }
    if (deleted.length) {
      const newSelection = selection.filter(
        (item) => deleted.indexOf(item) === -1
      )
      states.selection = newSelection
      table.$emit('selection-change', newSelection.slice())
    }
  }

  function toggleRowSelection(row, selected, emitChange = true) {
    const changed = toggleRowStatus(state.states.selection, row, selected)
    if (changed) {
      const newSelection = (state.states.selection || []).slice()
      // 调用 API 修改选中值，不触发 select 事件
      if (emitChange) {
        table.$emit('select', newSelection, row)
      }
      table.$emit('selection-change', newSelection)
    }
  }

  function _toggleAllSelection() {
    const states = state.states
    const { data = [], selection } = states
    // when only some rows are selected (but not all), select or deselect all of them
    // depending on the value of selectOnIndeterminate
    const value = states.selectOnIndeterminate
      ? !states.isAllSelected
      : !(states.isAllSelected || selection.length)
    states.isAllSelected = value

    let selectionChanged = false
    data.forEach((row, index) => {
      if (states.selectable) {
        if (
          states.selectable.call(null, row, index) &&
          toggleRowStatus(selection, row, value)
        ) {
          selectionChanged = true
        }
      } else {
        if (toggleRowStatus(selection, row, value)) {
          selectionChanged = true
        }
      }
    })

    if (selectionChanged) {
      table.$emit('selection-change', selection ? selection.slice() : [])
    }
    table.$emit('select-all', selection)
  }

  function updateSelectionByRowKey() {
    const states = state.states
    const { selection, rowKey, data } = states
    const selectedMap = getKeysMap(selection, rowKey)
    data.forEach((row) => {
      const rowId = getRowIdentity(row, rowKey)
      const rowInfo = selectedMap[rowId]
      if (rowInfo) {
        selection[rowInfo.index] = row
      }
    })
  }

  function updateAllSelected() {
    const states = state.states
    const { selection, rowKey, selectable } = states
    // data 为 null 时，解构时的默认值会被忽略
    const data = states.data || []
    if (data.length === 0) {
      states.isAllSelected = false
      return
    }

    let selectedMap
    if (rowKey) {
      selectedMap = getKeysMap(selection, rowKey)
    }
    const isSelected = function (row) {
      if (selectedMap) {
        return !!selectedMap[getRowIdentity(row, rowKey)]
      } else {
        return selection.indexOf(row) !== -1
      }
    }
    let isAllSelected = true
    let selectedCount = 0
    for (let i = 0, j = data.length; i < j; i++) {
      const item = data[i]
      // eslint-disable-next-line no-useless-call
      const isRowSelectable = selectable && selectable.call(null, item, i)
      if (!isSelected(item)) {
        if (!selectable || isRowSelectable) {
          isAllSelected = false
          break
        }
      } else {
        selectedCount++
      }
    }

    if (selectedCount === 0) isAllSelected = false
    states.isAllSelected = isAllSelected
  }

  // 过滤与排序
  function updateFilters(columns, values) {
    if (!Array.isArray(columns)) {
      columns = [columns]
    }
    const states = state.states
    const filters = {}
    columns.forEach((col) => {
      states.filters[col.id] = values
      filters[col.columnKey || col.id] = values
    })

    return filters
  }

  function updateSort(column, prop, order) {
    if (state.states.sortingColumn && state.states.sortingColumn !== column) {
      state.states.sortingColumn.order = null
    }
    state.states.sortingColumn = column
    state.states.sortProp = prop
    state.states.sortOrder = order
  }

  function execFilter() {
    const states = state.states
    const { _data, filters } = states
    let data = _data

    Object.keys(filters).forEach((columnId) => {
      const values = states.filters[columnId]
      if (!values || values.length === 0) return
      const column = getColumnById(state.states, columnId)
      if (column && column.filterMethod) {
        data = data.filter((row) => {
          return values.some((value) =>
            column.filterMethod.call(null, value, row, column)
          )
        })
      }
    })

    states.filteredData = data
  }

  function execSort() {
    const states = state.states
    states.data = sortData(states.filteredData, states)
  }

  // 根据 filters 与 sort 去过滤 data
  function execQuery(ignore) {
    if (!(ignore && ignore.filter)) {
      execFilter()
    }
    execSort()
  }

  function clearFilter(columnKeys) {
    const states = state.states
    const { tableHeader, fixedTableHeader, rightFixedTableHeader } = table.$refs

    let panels = {}
    if (tableHeader) panels = merge(panels, tableHeader.filterPanels)
    if (fixedTableHeader) panels = merge(panels, fixedTableHeader.filterPanels)
    if (rightFixedTableHeader)
      panels = merge(panels, rightFixedTableHeader.filterPanels)

    const keys = Object.keys(panels)
    if (!keys.length) return

    if (typeof columnKeys === 'string') {
      columnKeys = [columnKeys]
    }

    if (Array.isArray(columnKeys)) {
      const columns = columnKeys.map((key) => getColumnByKey(states, key))
      keys.forEach((key) => {
        const column = columns.find((col) => col.id === key)
        if (column) {
          // TODO: 优化这里的代码
          panels[key].filteredValue = []
        }
      })
      commit('filterChange', {
        column: columns,
        values: [],
        silent: true,
        multi: true
      })
    } else {
      keys.forEach((key) => {
        // TODO: 优化这里的代码
        panels[key].filteredValue = []
      })

      states.filters = {}
      commit('filterChange', {
        column: {},
        values: [],
        silent: true
      })
    }
  }

  function clearSort() {
    const states = state.states
    if (!states.sortingColumn) return

    updateSort(null, null, null)
    commit('changeSortCondition', {
      silent: true
    })
  }

  // 适配层，expand-row-keys 在 Expand 与 TreeTable 中都有使用
  function setExpandRowKeysAdapter(val) {
    // 这里会触发额外的计算，但为了兼容性，暂时这么做
    setExpandRowKeys(val)
    updateTreeExpandKeys(val)
  }

  // 展开行与 TreeTable 都要使用
  function toggleRowExpansionAdapter(row, expanded) {
    const hasExpandColumn = state.states.columns.some(
      ({ type }) => type === 'expand'
    )
    if (hasExpandColumn) {
      toggleRowExpansion(row, expanded)
    } else {
      toggleTreeExpansion(row, expanded)
    }
  }

  const mutations = {
    setData(states, data) {
      const dataInstanceChanged = states._data !== data
      states._data = data

      execQuery()
      // 数据变化，更新部分数据。
      // 没有使用 computed，而是手动更新部分数据 https://github.com/vuejs/vue/issues/6660#issuecomment-331417140
      updateCurrentRowData()
      updateExpandRows()
      if (states.reserveSelection) {
        assertRowKey()
        updateSelectionByRowKey()
      } else {
        if (dataInstanceChanged) {
          clearSelection()
        } else {
          cleanSelection()
        }
      }
      updateAllSelected()

      updateTableScrollY()
    },

    insertColumn(states, column, index, parent) {
      let array = states._columns
      if (parent) {
        array = parent.children
        if (!array) array = parent.children = []
      }

      if (typeof index !== 'undefined') {
        array.splice(index, 0, column)
      } else {
        array.push(column)
      }

      if (column.type === 'selection') {
        states.selectable = column.selectable
        states.reserveSelection = column.reserveSelection
      }

      if (table.$ready) {
        updateColumns() // hack for dynamics insert column
        scheduleLayout()
      }
    },

    removeColumn(states, column, parent) {
      let array = states._columns
      if (parent) {
        array = parent.children
        if (!array) array = parent.children = []
      }
      if (array) {
        array.splice(array.indexOf(column), 1)
      }

      if (table.$ready) {
        updateColumns() // hack for dynamics remove column
        scheduleLayout()
      }
    },

    sort(states, options) {
      const { prop, order, init } = options
      if (prop) {
        const column = arrayFind(
          states.columns,
          (column) => column.property === prop
        )
        if (column) {
          column.order = order
          updateSort(column, prop, order)
          commit('changeSortCondition', { init })
        }
      }
    },

    changeSortCondition(states, options) {
      // 修复 pr https://github.com/ElemeFE/element/pull/15012 导致的 bug
      const { sortingColumn: column, sortProp: prop, sortOrder: order } = states
      if (order === null) {
        states.sortingColumn = null
        states.sortProp = null
      }
      const ingore = { filter: true }
      execQuery(ingore)

      if (!options || !(options.silent || options.init)) {
        table.$emit('sort-change', {
          column,
          prop,
          order
        })
      }

      updateTableScrollY()
    },

    filterChange(states, options) {
      const { column, values, silent } = options
      const newFilters = updateFilters(column, values)

      execQuery()

      if (!silent) {
        table.$emit('filter-change', newFilters)
      }

      updateTableScrollY()
    },

    toggleAllSelection() {
      _toggleAllSelection()
    },

    rowSelectedChanged(states, row) {
      toggleRowSelection(row)
      updateAllSelected()
    },

    setHoverRow(states, row) {
      states.hoverRow = row
    },

    setCurrentRow(states, row) {
      updateCurrentRow(row)
    }
  }

  function commit(name, ...args) {
    if (mutations[name]) {
      mutations[name].apply(null, [state.states].concat(args))
    } else {
      throw new Error(`Action not found: ${name}`)
    }
  }

  return {
    assertRowKey,
    scheduleLayout,
    updateTreeExpandKeys,
    toggleTreeExpansion,
    loadOrToggle,
    setCurrentRowKey,
    updateCurrentRow,
    updateCurrentRowData,
    isRowExpanded,
    setExpandRowKeys,
    toggleRowExpansion,
    updateExpandRows,
    updateColumns,
    isSelected,
    clearSelection,
    cleanSelection,
    toggleRowSelection,
    _toggleAllSelection,
    updateSelectionByRowKey,
    updateAllSelected,
    updateFilters,
    updateSort,
    execFilter,
    execSort,
    execQuery,
    clearFilter,
    clearSort,
    setExpandRowKeysAdapter,
    toggleRowExpansionAdapter,
    states: state.states,
    commit
  }
}
