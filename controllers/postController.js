const sendgrid = require('@sendgrid/mail')
const Post = require('../models/Post')
sendgrid.setApiKey(process.env.SENDGRID_APIKEY)

exports.viewCreateScreen = function(req, res) {
    res.render('create-post')
}

exports.create = async function(req, res) {
    let post = new Post(req.body, req.session.user._id)
    try {
        const newId = await post.create()
        // sendgrid.send({
        //     to: 'recipient@mail.com',
        //     from: 'sender@mail.com',
        //     subject: req.title,
        //     text: req.body,
        //     html: req.body
        // })
        req.flash("success", "New post successfully created.")
        req.session.save(() => res.redirect(`/post/${newId}`))
    } catch(errors) {
        console.log(errors)
        errors.forEach(error => req.flash("errors", error))
        req.session.save(() => res.redirect("/create-post"))
    }
}

exports.viewSingle = async function(req, res) {
    try {
        const post = await Post.findSingleById(req.params.id, req.visitorId)
        res.render('single-post-screen', {post: post, title: post.title})
    } catch {
        res.render('404');
    }
}

exports.viewEditScreen = async function(req, res) {
    try {
        let post = await Post.findSingleById(req.params.id, req.visitorId)
        if (post.isVisitorOwner) {
            res.render("edit-post", {post: post})
        } else {
            req.flash("errors", "You do not have permission to perform that action")
            req.session.save(() => res.redirect("/"))
        }
    } catch {
        res.render("404")
    }
}

exports.edit = async function(req, res) {
    const post = new Post(req.body, req.visitorId, req.params.id)

    try {
        const status = await post.update()
         // the post was successfully updated in the database
         if (status == "success") {
            // post was updated in db
            req.flash("success", "Post successfully updated.")
            req.session.save(function () {
                res.redirect(`/post/${req.params.id}/edit`)
            })
            
        } else {
            // validation error
            post.errors.forEach(function(error) {
                req.flash("errors", error)
            })
            req.session.save(function () {
                res.redirect(`/post/${req.params.id}/edit`)
            })
        }
    } catch {
        // a post with the requested id doesn't exist
        // or if the current visitor is not the owner of the reuqested post
        req.flash("errors", "You do not have permission to perform that action.")
        req.session.save(function () {
            res.redirect("/")
        })
    }
}

exports.delete = async function(req, res) {
    try {
        Post.delete(req.params.id, req.visitorId)
        req.flash("success", "Post successfully deleted.")
        req.session.save(() => res.redirect(`/profile/${req.session.user.username}`))
    } catch {
        req.flash("errors", "You don't have permissions to perform that action")
        req.session.save(() => res.redirect("/"))
    }
}

exports.search = async function(req, res) {
    try {
        const posts = await Post.search(req.body.searchTerm)
        res.json(posts)
    } catch(err) {
        res.json([])
    }
}

// API Actions

exports.apiCreate = async function(req, res) {
    const post = new Post(req.body, req.apiUser._id)
    try {
        newId = await post.create()
        res.json(`Post with following id ${newId} is successfully created`)
    } catch(err) {
        res.json(err)
    }
}

exports.apiDelete = async function(req, res) {
    try {
        Post.delete(req.params.id, req.apiUser._id)
        res.json("Success")
    } catch {
        res.json("You do not have permission to perform that action!")
    }
}