import { walkTreeNode, getRowIdentity } from '../util'
import { reactive, computed, watch } from 'vue'

export function useTree({ table, assertRowKey, updateTableScrollY }) {
  const state = reactive({
    states: {
      // defaultExpandAll 存在于 expand.js 中，这里不重复添加
      // 在展开行中，expandRowKeys 会被转化成 expandRows，expandRowKeys 这个属性只是记录了 TreeTable 行的展开
      // TODO: 拆分为独立的 TreeTable，统一用法
      expandRowKeys: [],
      treeData: {},
      indent: 16,
      lazy: false,
      lazyTreeNodeMap: {},
      lazyColumnIdentifier: 'hasChildren',
      childrenColumnName: 'children'
    }
  })

  function normalize(data) {
    const {
      childrenColumnName,
      lazyColumnIdentifier,
      rowKey,
      lazy
    } = state.states
    const res = {}
    walkTreeNode(
      data,
      (parent, children, level) => {
        const parentId = getRowIdentity(parent, rowKey)
        if (Array.isArray(children)) {
          res[parentId] = {
            children: children.map((row) => getRowIdentity(row, rowKey)),
            level
          }
        } else if (lazy) {
          // 当 children 不存在且 lazy 为 true，该节点即为懒加载的节点
          res[parentId] = {
            children: [],
            lazy: true,
            level
          }
        }
      },
      childrenColumnName,
      lazyColumnIdentifier
    )
    return res
  }

  function updateTreeData() {
    const nested = state.normalizedData
    const normalizedLazyNode = state.normalizedLazyNode
    const keys = Object.keys(nested)
    const newTreeData = {}
    if (keys.length) {
      const {
        treeData: oldTreeData,
        defaultExpandAll,
        expandRowKeys,
        lazy
      } = state.states
      const rootLazyRowKeys = []
      const getExpanded = (oldValue, key) => {
        const included =
          defaultExpandAll ||
          (expandRowKeys && expandRowKeys.indexOf(key) !== -1)
        return !!((oldValue && oldValue.expanded) || included)
      }
      // 合并 expanded 与 display，确保数据刷新后，状态不变
      keys.forEach((key) => {
        const oldValue = oldTreeData[key]
        const newValue = { ...nested[key] }
        newValue.expanded = getExpanded(oldValue, key)
        if (newValue.lazy) {
          const { loaded = false, loading = false } = oldValue || {}
          newValue.loaded = !!loaded
          newValue.loading = !!loading
          rootLazyRowKeys.push(key)
        }
        newTreeData[key] = newValue
      })
      // 根据懒加载数据更新 treeData
      const lazyKeys = Object.keys(normalizedLazyNode)
      if (lazy && lazyKeys.length && rootLazyRowKeys.length) {
        lazyKeys.forEach((key) => {
          const oldValue = oldTreeData[key]
          const lazyNodeChildren = normalizedLazyNode[key].children
          if (rootLazyRowKeys.indexOf(key) !== -1) {
            // 懒加载的 root 节点，更新一下原有的数据，原来的 children 一定是空数组
            if (newTreeData[key].children.length !== 0) {
              throw new Error('[ElTable]children must be an empty array.')
            }
            newTreeData[key].children = lazyNodeChildren
          } else {
            const { loaded = false, loading = false } = oldValue || {}
            newTreeData[key] = {
              lazy: true,
              loaded: !!loaded,
              loading: !!loading,
              expanded: getExpanded(oldValue, key),
              children: lazyNodeChildren,
              level: ''
            }
          }
        })
      }
    }
    state.states.treeData = newTreeData

    updateTableScrollY()
  }

  function updateTreeExpandKeys(value) {
    state.states.expandRowKeys = value
    updateTreeData()
  }

  function toggleTreeExpansion(row, expanded) {
    assertRowKey()

    const { rowKey, treeData } = state.states
    const id = getRowIdentity(row, rowKey)
    const data = id && treeData[id]
    if (id && data && 'expanded' in data) {
      const oldExpanded = data.expanded
      expanded = typeof expanded === 'undefined' ? !data.expanded : expanded
      treeData[id].expanded = expanded
      if (oldExpanded !== expanded) {
        table.$emit('expand-change', row, expanded)
      }
      updateTableScrollY()
    }
  }

  function loadOrToggle(row) {
    assertRowKey()
    const { lazy, treeData, rowKey } = state.states
    const id = getRowIdentity(row, rowKey)
    const data = treeData[id]
    if (lazy && data && 'loaded' in data && !data.loaded) {
      loadData(row, id, data)
    } else {
      toggleTreeExpansion(row)
    }
  }

  function loadData(row, key, treeNode) {
    const { load } = table
    const { lazyTreeNodeMap, treeData } = state.states
    if (load && !treeData[key].loaded) {
      treeData[key].loading = true
      load(row, treeNode, (data) => {
        if (!Array.isArray(data)) {
          throw new Error('[ElTable] data must be an array')
        }
        treeData[key].loading = false
        treeData[key].loaded = true
        treeData[key].expanded = true
        if (data.length) {
          lazyTreeNodeMap[key] = data
        }
        table.$emit('expand-change', row, true)
      })
    }
  }

  // 嵌入型的数据，watch 无法是检测到变化 https://github.com/ElemeFE/element/issues/14998
  // TODO: 使用 computed 解决该问题，是否会造成性能问题？
  // @return { id: { level, children } }
  const normalizedData = computed(() => {
    if (!state.states.rowKey) return {}
    const data = state.states.data || []
    return normalize(data)
  })
  // @return { id: { children } }
  // 针对懒加载的情形，不处理嵌套数据
  const normalizedLazyNode = computed(() => {
    const { rowKey, lazyTreeNodeMap, lazyColumnIdentifier } = state.states
    const keys = Object.keys(lazyTreeNodeMap)
    const res = {}
    if (!keys.length) return res
    keys.forEach((key) => {
      if (lazyTreeNodeMap[key].length) {
        const item = { children: [] }
        lazyTreeNodeMap[key].forEach((row) => {
          const currentRowKey = getRowIdentity(row, rowKey)
          item.children.push(currentRowKey)
          if (row[lazyColumnIdentifier] && !res[currentRowKey]) {
            res[currentRowKey] = { children: [] }
          }
        })
        res[key] = item
      }
    })
    return res
  })
  watch(normalizedData, updateTreeData)
  watch(normalizedLazyNode, updateTreeData)

  return { updateTreeExpandKeys, toggleTreeExpansion, loadOrToggle }
}
