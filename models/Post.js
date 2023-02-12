const ObjectId = require('mongodb').ObjectId
const postsCollection = require('../db').db().collection('posts')
const followsCollection = require('../db').db().collection('follows')
const sanitizeHTML = require('sanitize-html')
const User = require('./User')

let Post = function(data, userId, requestedPostId) {
    this.data = data
    this.errors = []
    this.userId = userId
    this.requestedPostId = requestedPostId
}

Post.prototype.cleanUp = function() {
    if (typeof this.data.title !== "string") {this.data.title = ""}
    if (typeof this.data.body !== "string") {this.data.body = ""}

    // get rid of any invalid properties
    this.data = {
        author: ObjectId(this.userId),
        title: sanitizeHTML(this.data.title.trim(), {allowedTags: [], allowedAttributes: []}),
        body: sanitizeHTML(this.data.body.trim(), {allowedTags: [], allowedAttributes: []}),
        createDate: new Date()
    }
}

Post.prototype.validate = function() {
    if (this.data.title === "") {this.errors.push("You must provide a title.")}
    if (this.data.body === "") {this.errors.push("You must provide a post content.")}
}

Post.prototype.create = async function() {
    this.cleanUp()
    this.validate()

    if (!this.errors.length) {
        // save post into database
        try {
            const info = await postsCollection.insertOne(this.data)
            return info.insertedId
        } catch {
            this.errors.push("Please try again later.")
            throw this.errors
        }
    } else {
        throw this.errors
    }
}


Post.prototype.update = function() {
    return new Promise(async (resolve, reject) => {
        try {
            let post = await Post.findSingleById(this.requestedPostId, this.userId)
            if (post.isVisitorOwner) {
                let status = await this.updateQuery()
                resolve(status)
            } else {
                reject()
            }
        } catch {
            reject()
        }
    })
}

Post.prototype.updateQuery = function () {
    return new Promise(async (resolve, reject) => {
        this.cleanUp()
        this.validate()
        if (!this.errors.length) {
            postsCollection.findOneAndUpdate({_id: new ObjectId(this.requestedPostId)}, {$set: {title: this.data.title, body: this.data.body}})
            resolve("success")
        } else {
            resolve("fail")
        }
    })
}

Post.reusablePostQuery = function(uniqueOperations, visitorId, finalOperations = []) {
    return new Promise(async (resolve, reject) => {
        let aggOperations = uniqueOperations.concat([
            {$lookup: {from: "users", localField: "author", foreignField: "_id", as: "authorDocument"}},
            {$project: {
                title: 1,
                body: 1,
                createDate: 1,
                authorId: "$author",
                author: {$arrayElemAt: ["$authorDocument", 0]}
            }}
        ]).concat(finalOperations)

        let posts = await postsCollection.aggregate(aggOperations).toArray()

        // clean up author property in each post object
        posts = posts.map(function(post) {
            post.isVisitorOwner = post.authorId.equals(visitorId)
            post.authorId = undefined
            post.author = {
                username: post.author.username,
                avatar: new User(post.author, true).avatar
            }

            return post
        })
        resolve(posts)
    })
}

Post.findSingleById = function(id, visitorId) {
    return new Promise(async (resolve, reject) => {
        if (typeof(id) != "string" || !ObjectId.isValid(id)) {
            reject()
            return
        }
        let posts = await Post.reusablePostQuery([
            {$match: {_id: new ObjectId(id)}}
        ], visitorId)

        if (posts.length) {
            resolve(posts[0])
        } else {
            reject()
        }
    })
}

Post.findByAuthorId = function(authorId) {
    return Post.reusablePostQuery([
        {$match: {author: authorId}},
        {$sort: {createDate: -1}}
    ])
}

Post.delete = function(postIdForDelete, currentUserId){
    return new Promise(async (resolve, reject) => {
        try {
            let post = await Post.findSingleById(postIdForDelete, currentUserId)

            if (post.isVisitorOwner) {
                await postsCollection.deleteOne({_id: new ObjectId(postIdForDelete)})
                resolve()
            } else {
                reject()
            }
        } catch {
            reject()
        }
    })
}

Post.search = function(searchTerm) {
    return new Promise(async (resolve, reject) => {
        if (typeof(searchTerm) == "string") {
            let posts = await Post.reusablePostQuery([
                {$match: {$text: {$search: searchTerm}}}
            ], undefined, [{$sort: {score: {$meta: "textScore"}}}])

            resolve(posts)
        } else {
            reject()
        }
    })
}

Post.countPostsByAuthor = function(id) {
    return new Promise(async (resolve, reject) => {
        let postCount = await postsCollection.countDocuments({author: new ObjectId(id)})
        resolve(postCount)
    })
}

Post.getFeed = async function(id) {
    // create an array of the user ids that current user follows
    let followedUsers = await followsCollection.find({authorId: new ObjectId(id)}).toArray()
    followedUsers = followedUsers.map((followDoc) => {
        return followDoc.followedId
    })
    // look for posts where the author is in the above array of followed users
    return Post.reusablePostQuery([
        {$match: {author: {$in: followedUsers}}},
        {$sort: {createDate: -1}}
    ])
}

module.exports = Post