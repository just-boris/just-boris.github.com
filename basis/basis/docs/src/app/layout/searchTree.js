
  basis.require('app.core');
  basis.require('app.ext.docTree');
  
  module.exports = new app.ext.docTree.DocSearchTree({
    template: '<b:include src="basis.ui.tree.Tree" id="SearchTree"/>',
    selection: {},
    sorting: basis.getter('data.title', String.toLowerCase)
  });
