
  basis.require('basis.event');
  basis.require('basis.data');
  basis.require('basis.entity');
  basis.require('basis.net');
  basis.require('app.stat');

  // import names

  var getter = basis.getter;

  var nsData = basis.data;
  var nsEntity = basis.entity;
  var nsAjax = basis.net;
  

  // main part

  function resolveUrl(value){
    return basis.path.resolve(value.replace(/^\.\//, '../'));
  }


  var JsDocLinkEntity = new nsEntity.EntityType({
    name: 'JsDocLinkEntity',
    fields: {
      url: nsEntity.StringId,
      title: function(value){ return value != null ? String(value) : null; }
    }
  });

  var JsDocLinkEntity_init_ = JsDocLinkEntity.entityType.entityClass.prototype.init;
  JsDocLinkEntity.entityType.entityClass.prototype.init = function(){
    JsDocLinkEntity_init_.apply(this, arguments);
    resourceLoader.addResource(this.data.url, 'link');
  };


  var JsDocEntity = new nsEntity.EntityType({
    name: 'JsDocEntity',
    fields: {
      path: nsEntity.StringId,
      file: String,
      line: Number,
      text: String,
      context: String,
      tags: basis.fn.$self
    }
  });

  var JsDocConfigOption = new nsEntity.EntityType({
    fields: {
      path: nsEntity.StringId,
      constructorPath: String,
      name: String,
      type: String,
      description: String
    }
  });

  var awaitingUpdateQueue = {};

  function fetchInheritedJsDocs(path, entity){
    var objData = mapDO[path].data;
    if (/class|property|method/.test(objData.kind))
    {
      var postPath = objData.kind == 'class' ? '' : '.prototype.' + objData.title;
      var inheritance = getInheritance(objData.kind == 'class' ? objData.obj : mapDO[objData.path.replace(/.prototype$/, '')].data.obj, objData.kind == 'class' ? null : objData.title);
      for (var i = inheritance.length, inherit; inherit = inheritance[--i];)
      {
        var inheritedEntity = JsDocEntity.get(inherit.cls.className + postPath);
        if (inheritedEntity && inheritedEntity.data.text)
        {
          entity.set('text', inheritedEntity.data.text);
          return true;
        }
      }
    }
  }
  
  function processAwaitingJsDocs(){
    var keys = basis.object.keys(awaitingUpdateQueue);
    for (var k = 0; k < keys.length; k++)
    {
      var fullPath = keys[k];
      var awaitingEntity = awaitingUpdateQueue[fullPath];
      if (fetchInheritedJsDocs(fullPath, awaitingEntity))
        delete awaitingUpdateQueue[fullPath];
    }
  }

  function parseJsDocText(text){
    var parts = text.split(/^\s*@([a-z]+)[\t ]*/im);
    var tags = {};
    parts.unshift('description');
    for (var i = 0, key; key = parts[i]; i += 2)
    {
      var value = parts[i + 1];
      if (key == 'param' || key == 'config')
      {
        if (!tags[key])
          tags[key] = {};

        var p = value.match(/^\s*\{([^\}]+)\}\s+(\S+)(?:\s+((?:.|[\r\n])+))?/i);
        if (!p)
        {
          basis.dev.warn('jsdoc parse error: ', value, text);
        }
        else
        {
          tags[key][p[2]] = {
            type: p[1],
            description: p[3]
          };
        }
      }
      else if (key == 'see' || key == 'link')
      {
        if (!tags[key])
          tags[key] = [];

        tags[key].push(value);
      }
      else if (/returns?/.test(key))
      {
        key = 'returns';
        if (!tags[key])
          tags[key] = {};
        var p = value.match(/^\s*\{([^\}]+)\}(?:\s+(.+))?/i);
        if (!p)
        {
          basis.dev.warn('jsdoc parse error: ', this.data.path, value, p);
        }
        else
        {
          tags[key] = {
            type: p[1],
            description: p[2]
          };
        }
      }
      else
        tags[key] = value;
    }

    if (tags.inheritDoc)
    {
      var path = this.data.path;
      var p = path.split('.prototype.');
      var sup = mapDO[p[0]].data.obj.superClass_;
      if (sup)
      {
        var desc = sup.docsProto_[p[1]];
        if (desc)
        {
          //basis.dev.log(path + ' -> ' + desc.cls.className);
          this.setInheritDoc(JsDocEntity(desc.cls.className + '.prototype.' + p[1]));
        }
      }
      return;
    }

    delete tags.inheritDoc;
    if (tags.description.trim() == '')
      delete tags.description;

    this.set('tags', basis.object.keys(tags).length ? tags : null);
  }


  basis.data.SUBSCRIPTION.addProperty('inheritDoc');

  var destroyJsDocEntity = JsDocEntity.entityType.entityClass.prototype.destroy;
  JsDocEntity.entityType.entityClass.extend({
    subscribeTo: basis.data.SUBSCRIPTION.INHERITDOC,
    emit_inheritDocChanged: basis.event.create('inheritDocChanged'),
    inheritDoc: null,
    listen: {
      inheritDoc: {
        update: function(sender, delta){
          if ('tags' in delta)
            this.set('tags', sender.data.tags);
        }
      }
    },
    emit_update: function(delta){
      nsData.Object.prototype.emit_update.call(this, delta);
      if (this.subscriberCount && 'text' in delta)
      {
        var self = this;
        basis.nextTick(function(){
          self.parseText(self.data.text);
        });
      }
      this.setActive(!!this.subscriberCount);
    },
    emit_subscribersChanged: function(){
      nsData.Object.prototype.emit_subscribersChanged.call(this);
      if (this.subscriberCount && this.data.text)
      {
        var self = this;
        basis.nextTick(function(){
          self.parseText(self.data.text);
        });
      }
      this.setActive(!!this.subscriberCount);
    },
    parseText: function(text){
      if (this.parsedText_ != text)
      {
        this.parsedText_ = text;
        parseJsDocText.call(this, text);
      }
    },
    setInheritDoc: function(doc){
      var oldInherit = this.inheritDoc;
      if (oldInherit != doc)
      {
        var listenHandler = this.listen.inheritDoc;
        if (listenHandler)
        {
          if (oldInherit)
            oldInherit.removeHandler(listenHandler, this);
          if (doc)
            doc.addHandler(listenHandler, this);
        }

        this.inheritDoc = doc;

        if (doc)
          this.set('tags', doc.data.tags);

        this.emit_inheritDocChanged(oldInherit);
      }
    },
    destroy: function(){
      if (this.inheritDoc)
        this.setInheritDoc(null);

      destroyJsDocEntity.call(this);
    }
  });

  //jsDocs = {};

  //
  // Analyze object structure
  //

  var mapDO = {};
  var members = {};
  var searchValues = [];

  var walkThroughCount = 0;
  var clsSeed = 1;
  
  var clsList = [{
    docsUid_: 0,
    docsLevel_: 0,
    docsProto_: {}
  }];

  function getClassDocsProtoDescr(cls){
    if (!cls)
      return clsList[0];

    if (!cls.docsProto_)
    {
      var superDescr = getClassDocsProtoDescr(cls.superClass_);
      var Proto = function(){};
      Proto.prototype = superDescr.docsProto_;
      cls.docsUid_ = clsSeed++;
      cls.docsProto_ = new Proto;
      cls.docsSuperUid_ = superDescr.docsUid_;
      cls.docsLevel_ = superDescr.docsLevel_ + 1;
      clsList.push(cls);
    }

    return cls;
  }

  var walkCount = 0;
  function walk(ctx){
    walkCount++;
    var scope = ctx.scope;

    if (scope.basisDocsVisited_)
      return;

    scope.basisDocsVisited_ = true;

    var path = ctx.path || '';
    var context = ctx.context;
    var deep = 1 + (ctx.deep || 0);
    var ns = ctx.namespace || '';

    if (deep > 8)
    {
      ;;;basis.dev.log('Deep more than 8 for path:', path);
      return;
    }

    members[path] = [];

    // new
    var isPrototype = context == 'prototype';
    if (isPrototype)
    {
      var clsPath = path.replace(/\.prototype$/, '');
      var cls = mapDO[clsPath] && mapDO[clsPath].data.obj;
      getClassDocsProtoDescr(cls);
      var clsProto = cls.docsProto_;
      var superClsPrototype = cls && cls.superClass_ && cls.superClass_.prototype;
    }

    var keys = context == 'namespace' ? scope.exports : scope;
    for (var key in keys)
    {
      walkCount++;
      // ignore for private names
      if (/_$/.test(key))
        continue;

      var obj = scope[key];
      
      if (   (key == 'constructor')
          || (key == 'prototype')
          //|| (key == 'init' && context == 'prototype')
          || (key == 'className' && context == 'class')
          || (key == 'subclass' && context == 'class')
          || (key == 'isSubclassOf' && context == 'class')
          || (key == 'toString' && (Object.prototype.toString === obj || basis.Class.prototype.toString === obj)))
        continue;

      walkThroughCount++;

      var fullPath = path ? (path + '.' + key) : key;
      var title = key;
      var kind;
      var tag;

      if (mapDO[fullPath])
      {
        ;;;basis.dev.log('double scan: ', fullPath);
        continue;
      }

      if (typeof obj == 'function')
      {
        var isClass = basis.Class.isClass(obj);
        if (isPrototype)
        {
          if (isClass)   // for properties which contains ref for class
            kind = 'property';
          else
          {
            var m = title.match(/^emit_(.+)/);
            if (m)
            {
              kind = 'event';
              title = m[1];
            }
            else
              kind = 'method';
          }
        }
        else
        {
          kind = isClass ? 'class' : 'function';

          if (context == 'class' && kind == 'function')
            if (obj === Function.prototype[key] || obj === basis.Class[key])
              continue;
        }
      }
      else
      {
        if (obj instanceof basis.constructor) // basis.constructor === basis.Namespace
          kind = 'namespace';
        else if (isPrototype)
          kind = 'property';
        else if (obj && (obj == document || (obj.ownerDocument && obj.ownerDocument == document)))
          kind = 'htmlElement';
        else
          kind = /[^A-Z0-9_]/.test(key) ? (obj && typeof obj == 'object' ? 'object' : 'property') : 'constant';
      }

      if (isPrototype)
      {
        if (superClsPrototype && key in superClsPrototype)
          tag = obj !== superClsPrototype[key] ? 'override' : null;
        else
          tag = 'implement';

        if (tag)
        {
          clsProto[key] = {
            path: fullPath,
            key: key,
            cls: cls,
            kind: kind,
            tag: tag
          };
          //if (!window.yyy_) window.yyy_ = 1; else window.yyy_ += 1;
        }
        else
        {
          //if (!window.xxx_) window.xxx_ = 1; else window.xxx_ += 1;
          //return;
        }
      }

      var dataObject = mapDO[fullPath] = new nsData.Object({
        data: {
          path: path,
          fullPath: fullPath,
          key: key,
          title: title,
          kind: kind,
          obj: obj
        }
      });
      
      members[path].push(dataObject);

      if (/^(function|class|constant|namespace)$/.test(kind))
        searchValues.push(dataObject);

      // go deeper
      switch (kind)
      {
        case 'class':
          dataObject.data.namespace = ns;

          //walk(obj, fullPath, kind, d + 1, ns);
          walk({
            scope: obj,
            path: fullPath,
            context: 'class',
            deep: deep,
            namespace: ns
          });
          //walk(obj.prototype, fullPath + '.prototype', 'prototype', d + 1, ns);
          walk({
            scope: obj.prototype,
            path: fullPath + '.prototype',
            context: 'prototype',
            deep: deep,
            namespace: ns
          });

        break;
        case 'namespace':
          //walk(obj, fullPath, kind, d + 1, fullPath);
          walk({
            scope: obj,
            path: fullPath,
            context: 'namespace',
            deep: deep,
            namespace: fullPath
          });

        break;
        case 'constant':
        case 'object':
          if (obj && typeof obj == 'object')
          {
            //walk(obj, fullPath, kind, d + 1, ns);
            walk({
              scope: obj,
              path: fullPath,
              context: 'object',
              deep: deep,
              namespace: ns
            });
          }
        break;
      }
    }

    delete scope.basisDocsVisited_;
  }

  var walkStartTime = Date.now();

  basis.namespaces_['basis'] = basis;
  walk({
    scope: basis.namespaces_,
    context: 'object'
  });
  var walkTime = Date.now() - walkStartTime;
  //basis.dev.log(walkTime, '/', walkThroughCount);
  app.stat.walkTime.set(walkTime);
  app.stat.walkCount.set(walkCount);
  app.stat.tokenCount.set(basis.object.keys(mapDO).length);

  //
  // --------------------------------
  //

  function getFunctionDescription(func){
    if (typeof func == 'function' && func.className && func.prototype && typeof func.prototype.init == 'function')
      func = func.prototype.init;

    if (func.basisDocFD_)
      return func.basisDocFD_;

    return func.basisDocFD_ = basis.utils.info.fn(func);
  }

  function getMembers(path){
    //var objData = mapDO[path] && mapDO[path].data;
    //return objData.kind == 'class' ? basis.object.iterate(objData.obj.docsProto_, function(key, value){ return mapDO[value.path] }) : 
    return members[path];
  }

  function getInheritance(cls, key){
    var result = [];
    var cursor = cls;

    while (cursor)
    {
      result.unshift({ cls: cursor, obj: cursor, present: !key });
      cursor = cursor.superClass_;
    }

    if (key && result.length)
    {
      var value;
      var presentCount = 0;
      for (var i = 0; i < result.length; i++)
      {
        var proto = result[i].cls.prototype;
        var present = key in proto && proto[key] !== value;
        result[i].present = present; 
        if (present)
          result[i].tag = presentCount++ ? 'override' : 'implement';
        value = proto[key];
      }
    }

    return result;
  }

  var sourceParser = {
    'jsdoc': function(resource){

      function getTextFromCode(source){
        return source.replace(/(^|\*)\s+@/, '@').replace(/(^|\n+)\s*\*/g, '\n').trimLeft();
      }

      function createJsDocEntity(source, path){
        var text = getTextFromCode(source);
        JsDocEntity({
          path: path,
          text: text,
          file: resource.url,
          line: line + 1 + lineFix
        });
      }

      var ns = '';
      var isClass;
      var clsPrefix = '';
      var skipDeclaration = false;
      var line = 0;
      var lineFix;
      var scopeNS;
      var jsDocsName;
      var parts = resource.text
        .replace(/\r\n|\n\r|\r/g, '\n')
        .replace(/\/\*+(\s*@cut.+\*)?\//g, '')
        .split(/(?:\/\*\*((?:.|\n)+?)\*\/)/);

      parts.reduce(function(jsdoc, code, idx){
        lineFix = 0;
        if (idx % 2)
        {
          if (jsDocsName = code.match(/@name\s+([a-z0-9_\$\.]+)/i))
            jsDocsName = jsDocsName[1];

          if (code.match(/@annotation/))
          {
            skipDeclaration = true;
          }
          else
          {
            jsdoc.push(code);
            var m = code.match(/@namespace\s+(\S+)?/);
            if (m)
            {
              if (m[1])
                scopeNS = m[1];

              ns = scopeNS;
              code = code.replace(/@namespace([^\n]*|$)/, '');

              var nsjsdoc = JsDocEntity.get(ns);
              if (nsjsdoc)
              {
                nsjsdoc.update({
                  text: nsjsdoc.data.text + getTextFromCode(code),
                  line: line + 1 + lineFix
                });
              }
              else
                createJsDocEntity(code, ns);

              skipDeclaration = true;
            }
            isClass = !!code.match(/@class/);
            if (isClass)
              clsPrefix = '';
          }
        }
        else
        {
          if (!skipDeclaration && idx)
          {
            var m = code.match(/^([\s\n]*)(var\s+|function\s+)?([a-z0-9_\$\.]+)/i);
            if (m)
            {
              var name = jsDocsName || m[3];

              if (m[2])
                clsPrefix = '';

              lineFix = (m[1].match(/\n/g) || []).length;
              createJsDocEntity(jsdoc[jsdoc.length - 1], ns + '.' + (clsPrefix ? clsPrefix + '.prototype.' : '') + name);
              
              if (isClass)
                clsPrefix = name;
            }
          }
          skipDeclaration = false;
        }

        line += (code.match(/\n/g) || []).length;

        return jsdoc;
      }, []);

      processAwaitingJsDocs();
    },
    'link': function(resource){
      var title = resource.text.match(/<title>(.+?)<\/title>/i);
      JsDocLinkEntity({
        title: title[1] || null,
        url: resource.url
      });
    }
  };

  var RESOURCE_ATTEMPT_LOAD = 1;
  var resourceLoader = {
    queue: [],
    loaded: {},
    curResource: null,
    transport: basis.fn.lazyInit(function(){
      var transport = new nsAjax.Transport();

      transport.addHandler({
        failure: function(){
          var curResource = this.curResource;
          if (++curResource.attemptCount < RESOURCE_ATTEMPT_LOAD)
            this.queue.push(curResource);
        },
        success: function(sender, req){
          var curResource = this.curResource;
          curResource.text = req.data.responseText;
          sourceParser[curResource.kind](curResource);
        },
        complete: function(){
          this.curResource = null;
          basis.nextTick(this.load.bind(this));
        }
      }, resourceLoader);

      return transport;
    }),
    addResource: function(url, kind){
      url = basis.path.resolve(url);
      if (!this.loaded[url])
      {
        this.queue.push({
          url: url,
          kind: kind,
          attemptCount: 0
        });

        basis.nextTick(this.load.bind(this));
      }
    },
    load: function(){
      if (this.curResource)
        return;

      this.curResource = this.queue.shift();

      if (this.curResource)
        this.transport().request({
          url: this.curResource.url
        });
    }
  };

  basis.source_ = basis.net.request(basis.filename_);
  var resolveQueue = basis.object.values(basis.namespaces_).concat(basis).map(function(ns){
    if (ns.source_)
      return {
        url: ns.filename_,
        kind: 'jsdoc',
        text: '/** @namespace ' + (ns === basis ? 'basis' : ns.path) + '*/' + ns.source_
      };
  }).filter(Boolean);

  var resolveResStart = new Date;
  function resolveRes(){
    var item = resolveQueue.shift();
    if (item)
    {
      sourceParser[item.kind](item);
      basis.nextTick(resolveRes);
    }
    else
      basis.dev.log(new Date - resolveResStart);
  }
  basis.nextTick(resolveRes);


  module.exports = {
    mapDO: mapDO,
    clsList: clsList,

    JsDocEntity: JsDocEntity,
    JsDocLinkEntity: JsDocLinkEntity,
    JsDocConfigOption: JsDocConfigOption,

    resolveUrl: resolveUrl,

    getFunctionDescription: getFunctionDescription,
    getMembers: getMembers,
    getInheritance: getInheritance,
    loadResource: resourceLoader.addResource.bind(resourceLoader),

    searchIndex: new basis.data.Dataset({ items: searchValues, listen: { item: null } })
  };
