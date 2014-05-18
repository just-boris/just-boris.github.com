
  basis.require('basis.ui.code');

  /*basis.require('app.view.templateView.actions');
  basis.require('app.view.templateView.bindings');*/

  //basis.require('app.views.templateView.tree');
  var buildTemplateTree = resource('buildTemplateTree.js')();//app.view.templateView.tree.buildTemplate;


  function resolveFunction(fn){
    var info = basis.utils.info.fn(fn);
    var result = {
      asIs: info.source
    };

    if (info.getter)
      result.getter = info.getter;

    return result;
  }

 /**
  * @class
  */
  var BindingsPanel = basis.ui.Node.subclass({
    templateUpdate: function(){
      var template = this.delegate.templateView;
      var binding;
      if (template)
      {
        var matchBinding = template.getBinding(this.data.obj.prototype.binding);
        binding = basis.object.iterate(this.data.obj.prototype.binding, function(key, value){
          return typeof value == 'object' ? {
            data: {
              name: key,
              getter: value.getter,
              events: value.events,
              used: matchBinding && matchBinding.names.indexOf(key) != -1
            }
          } : null;
        }).filter(Boolean);
      }

      this.setChildNodes(binding);
    },

    template: resource('template/bindingsPanel.tmpl'),

    sorting: 'data.name',

    childClass: {
      expanded: false,
      emit_toggle: basis.event.create('toggle'),

      template: resource('template/bindingsPanelItem.tmpl'),

      binding: {
        name: 'data:',
        events: 'data:events || ""',
        used: function(node){
          return node.data.used ? 'used' : '';
        },
        expanded: {
          events: 'toggle',
          getter: function(node){
            return node.expanded ? 'expanded' : '';
          }
        },
        source: 'satellite:'
      },

      action: {
        toggle: function(){
          this.expanded = !this.expanded;
          this.emit_toggle();
        }
      },

      satellite: {
        source: {
          events: 'toggle',
          existsIf: basis.getter('expanded'),
          instanceOf: basis.ui.code.SourceCode.subclass({
            autoDelegate: basis.dom.wrapper.DELEGATE.OWNER,
            lang: 'js',
            lineNumber: false,
            codeGetter: function(node){
              var code = resolveFunction(node.data.getter);
              return code.getter || code.asIs;
            }
          })
        }
      }
    }
  });

 /**
  * @class
  */
  var ActionsPanel = basis.ui.Node.subclass({
    templateUpdate: function(){
      var cls = this.data.obj;

      if (cls && basis.Class.isClass(cls))
      {
        var action = cls.prototype.action;
        var childNodes = [];
        if (action)
        {
          for (var actionName in action)
            if (actionName != '__extend__' && typeof action[actionName] == 'function')
            {
              childNodes.push({
                data: {
                  name: actionName,
                  action: action[actionName],
                  used: true
                }
              });
            }
        }

        this.setChildNodes(childNodes);
      }
    },

    template: resource('template/actionsPanel.tmpl'),

    sorting: 'data.name',

    childClass: {
      expanded: false,
      emit_toggle: basis.event.create('toggle'),

      template: resource('template/actionsPanelItem.tmpl'),

      binding: {
        name: 'data:',
        used: function(node){
          return node.data.used ? 'used' : '';
        },
        expanded: {
          events: 'toggle',
          getter: function(node){
            return node.expanded ? 'expanded' : '';
          }
        },
        source: 'satellite:'
      },

      action: {
        toggle: function(){
          this.expanded = !this.expanded;
          this.emit_toggle();
        }
      },

      satellite: {
        source: {
          events: 'toggle',
          existsIf: basis.getter('expanded'),
          instanceOf: basis.ui.code.SourceCode.subclass({
            autoDelegate: basis.dom.wrapper.DELEGATE.OWNER,
            lang: 'js',
            lineNumber: false,
            codeGetter: function(node){
              var code = resolveFunction(node.data.action);
              return code.getter || code.asIs;
            }
          })
        }
      }
    }
  });


 /**
  * @class
  */
  var TemplatePanel = basis.ui.Node.subclass({
    template: resource('template/templatePanel.tmpl'),

    binding: {
      bindings: 'satellite:',
      actions: 'satellite:',
      isExternalFile: function(node){
        var template = node.data.obj && node.data.obj.prototype.template;
        if (template && template.source && template.source.url)
          return 'isExternalFile';
        return '';
      },
      externalFileCaption: function(node){
        var template = node.data.obj && node.data.obj.prototype.template;
        return basis.path.basename((template && template.source && template.source.url) || '');
      },
      externalFileUrl: function(node){
        var template = node.data.obj && node.data.obj.prototype.template;
        var url = (template && template.source && template.source.url) || '';
        
        return url && basis.path.relative(url);
      }
    },

    emit_templateViewChanged: basis.event.create('templateViewChanged'),

    templateUpdate: function(){
      var rootCfg = {};

      var template = this.data.obj.prototype.template;

      if (this.templateView === template)
        return;

      if (template)
      {
        rootCfg.childNodes = template.docsCache_;

        if (!rootCfg.childNodes)
        {
          rootCfg.childNodes = [];

          var decl = basis.template.getDeclFromSource(template.source, template.baseURI);

          rootCfg.childNodes = buildTemplateTree(decl.tokens);
        }
      }

      this.setChildNodes(rootCfg.childNodes || [], true);
      this.updateBind('isExternalFile');
      this.updateBind('externalFileCaption');
      this.updateBind('externalFileUrl');

      if (template)
        template.docsCache_ = basis.array.from(this.childNodes);

      var oldTemplate = this.templateView;
      this.templateView = template;
      this.emit_templateViewChanged(oldTemplate);
    },

    satellite: {
      bindings: {
        events: 'templateViewChanged',
        existsIf: basis.getter('templateView'),
        delegate: basis.fn.$self,
        instanceOf: BindingsPanel
      },
      actions: {
        events: 'templateViewChanged',
        existsIf: basis.getter('templateView'),
        delegate: basis.fn.$self,
        instanceOf: ActionsPanel
      }
    }
  });

  //
  // exports
  //
  module.exports = TemplatePanel;
